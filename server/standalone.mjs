import http from 'node:http'
import { randomBytes } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable, Transform } from 'node:stream'

/**
 * Optional standalone HTTPS-reverse-proxy backend.
 * The user's key is stored only in this process's short-lived in-memory session.
 * Do not run a public service behind plain HTTP or expose the admin/upstream key.
 */
const PORT = Number(process.env.PORT || '3005')
const HOST = process.env.HOST || '127.0.0.1'
const BASE = process.env.UPSTREAM_API_BASE_URL
const NODE_ENV = process.env.NODE_ENV || 'development'
const isProduction = NODE_ENV === 'production'
const MAX_REQUEST_BYTES = 24 * 1024 * 1024
const SESSION_TTL = 4 * 60 * 60 * 1000
const sessionMap = new Map()
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')

if (!BASE) throw new Error('Set UPSTREAM_API_BASE_URL to the fixed, trusted NewAPI site URL.')
const upstream = new URL(BASE)
if (upstream.username || upstream.password || upstream.search || upstream.hash) throw new Error('Invalid upstream URL')
if (isProduction && upstream.protocol !== 'https:') throw new Error('Production upstream requires HTTPS')
if (!['http:', 'https:'].includes(upstream.protocol)) throw new Error('Only HTTP(S) upstreams are allowed')
const upstreamRoot = upstream.origin + upstream.pathname.replace(/\/v1\/?$/, '').replace(/\/$/, '')
const allowedEndpoints = new Set([
  '/v1/models',
  '/v1/chat/completions',
  '/v1/responses',
  '/v1/images/generations',
  '/v1/images/edits',
])
const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png',
  '.webp': 'image/webp', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json',
}

function reply(res, status, json, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra })
  res.end(JSON.stringify(json))
}
function secureOrigin(req) {
  const origin = req.headers.origin
  if (typeof origin !== 'string') return false
  try {
    const parsed = new URL(origin)
    const requestedHost = req.headers.host
    if (!requestedHost || parsed.host !== requestedHost) return false
    return isProduction ? parsed.protocol === 'https:' : ['http:', 'https:'].includes(parsed.protocol)
  } catch { return false }
}
function selectedSession(req) {
  const cookie = req.headers.cookie?.split(';').map(p => p.trim()).find(p => p.startsWith('pg_session='))
  const id = cookie?.slice('pg_session='.length)
  if (!id) return null
  const value = sessionMap.get(id)
  if (!value) return null
  if (value.expires < Date.now()) { sessionMap.delete(id); return null }
  return value
}
function cookieHeader(id, maxAge = 0) {
  return `pg_session=${id}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${maxAge}${isProduction ? '; Secure' : ''}`
}
async function readLimited(req, maxBytes) {
  const buffers = []
  let received = 0
  for await (const chunk of req) {
    received += chunk.length
    if (received > maxBytes) throw new Error('Request too large')
    buffers.push(chunk)
  }
  return Buffer.concat(buffers)
}
function upstreamHeaders(token, type) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json, text/event-stream',
    ...(type ? {'Content-Type': type} : {}),
  }
}
async function upstreamRequest(endpoint, token, opts = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), opts.timeout || 180000)
  try {
    const response = await fetch(upstreamRoot + endpoint, {
      method: opts.method || 'GET',
      headers: upstreamHeaders(token, opts.contentType),
      body: opts.body,
      redirect: 'manual',
      signal: controller.signal,
    })
    // Avoid ever forwarding a bearer credential across redirects.
    return response
  } finally {
    clearTimeout(timeout)
  }
}
async function proxy(req, res, endpoint, token) {
  const allowed = endpoint === '/v1/models' ? req.method === 'GET' : req.method === 'POST'
  if (!allowed || !allowedEndpoints.has(endpoint)) return reply(res, 404, {error:{message:'Unknown API endpoint'}})
  const claimedLength = Number(req.headers['content-length'] || 0)
  if (claimedLength > MAX_REQUEST_BYTES) return reply(res,413,{error:{message:'Request too large'}})
  // Keep at most 24 MiB in memory before forwarding so oversized uploads
  // cannot become unbounded public proxy traffic.
  const body = req.method === 'POST' ? await readLimited(req, MAX_REQUEST_BYTES) : undefined
  const contentType = typeof req.headers['content-type'] === 'string' ? req.headers['content-type'] : undefined
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 240000)
  res.on('close', () => { if (!res.writableEnded) controller.abort() })
  try {
    const response = await fetch(upstreamRoot + endpoint, {
      method: req.method,
      headers: upstreamHeaders(token, contentType),
      body,
      redirect: 'manual',
      signal: controller.signal,
    })
    const type = response.headers.get('content-type') || 'application/json'
    // Redirects are not followed, to prevent sending credentials to other sites.
    if (response.status >= 300 && response.status < 400) return reply(res,502,{error:{message:'Unexpected upstream redirect'}})
    res.writeHead(response.status, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(response.headers.get('x-request-id') ? {'x-request-id': response.headers.get('x-request-id')} : {}),
    })
    if (!response.body) return res.end()
    const fromWeb = Readable.fromWeb(response.body)
    fromWeb.on('error', () => { if (!res.writableEnded) res.destroy() })
    fromWeb.pipe(res)
  } catch {
    if (!res.headersSent) reply(res,502,{error:{message:'Upstream connection failed or timed out'}})
    else res.destroy()
  } finally {
    clearTimeout(timeout)
  }
}
async function staticFile(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return reply(res,405,{error:{message:'Method not allowed'}})
  if (pathname.includes('..') || pathname.includes('\\') || pathname.startsWith('/.')) return reply(res,403,{error:{message:'Forbidden'}})
  let filename = path.resolve(root, '.' + pathname)
  if (!filename.startsWith(root + path.sep) && filename !== root) return reply(res,403,{error:{message:'Forbidden'}})
  let info = await stat(filename).catch(() => null)
  if (info?.isDirectory()) { filename = path.join(filename, 'index.html'); info = await stat(filename).catch(() => null) }
  if (!info?.isFile()) {
    filename = path.join(root, 'index.html')
    info = await stat(filename).catch(() => null)
    if (!info?.isFile()) return reply(res,404,{error:{message:'Build dist/ first'}})
  }
  const bytes = await readFile(filename)
  res.writeHead(200, {
    'Content-Type': contentTypes[path.extname(filename)] || 'application/octet-stream',
    'Cache-Control': filename.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; connect-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
  })
  res.end(req.method === 'HEAD' ? undefined : bytes)
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost')
    const pathname = decodeURIComponent(url.pathname)
    if (pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && !secureOrigin(req)) return reply(res,403,{error:{message:'Cross-origin request denied'}})
      if (pathname === '/api/connection' && req.method === 'GET') {
        return reply(res,200,{connected:!!selectedSession(req), expiresAt:selectedSession(req)?.expires || null})
      }
      if (pathname === '/api/connection' && req.method === 'DELETE') {
        const cookie = req.headers.cookie?.split(';').map(p=>p.trim()).find(p=>p.startsWith('pg_session='))
        if (cookie) sessionMap.delete(cookie.slice('pg_session='.length))
        return reply(res,200,{connected:false},{'Set-Cookie':cookieHeader('',0)})
      }
      if (pathname === '/api/connection' && req.method === 'POST') {
        const payload = JSON.parse((await readLimited(req,8192)).toString('utf8'))
        const token = typeof payload?.token === 'string' ? payload.token.trim() : ''
        if (token.length < 8 || token.length > 512 || /[\r\n]/.test(token)) return reply(res,400,{error:{message:'Invalid user token'}})
        // Verify the user-supplied token without ever exposing or persisting its plaintext.
        const probe = await upstreamRequest('/v1/models',token,{timeout:12000})
        if (!probe.ok) return reply(res,401,{error:{message:'NewAPI rejected this token, or model listing is unavailable'}})
        const id = randomBytes(32).toString('base64url')
        const expires = Date.now()+SESSION_TTL
        sessionMap.set(id,{token,expires})
        return reply(res,200,{connected:true,expiresAt:expires},{'Set-Cookie':cookieHeader(id, Math.floor(SESSION_TTL/1000))})
      }
      if (pathname === '/api/models' && req.method === 'GET') {
        const session = selectedSession(req)
        if (!session) return reply(res,401,{error:{message:'Connect your own NewAPI token first'}})
        return proxy(req,res,'/v1/models',session.token)
      }
      if (pathname.startsWith('/api/relay/v1/')) {
        const session = selectedSession(req)
        if (!session) return reply(res,401,{error:{message:'Connect your own NewAPI token first'}})
        return proxy(req,res,pathname.slice('/api/relay'.length),session.token)
      }
      return reply(res,404,{error:{message:'Unknown API endpoint'}})
    }
    await staticFile(req,res,pathname)
  } catch (e) {
    reply(res, e instanceof SyntaxError ? 400 : e?.message === 'Request too large' ? 413 : 500, {error:{message:e?.message === 'Request too large' ? 'Request too large' : 'Request could not be processed'}})
  }
})
setInterval(()=>{for(const [id, session] of sessionMap)if(session.expires<Date.now())sessionMap.delete(id)},60000).unref()
server.listen(PORT,HOST,()=>{process.stdout.write(`Playground listening at http://${HOST}:${PORT} (upstream fixed; credentials held in memory)\n`)})
