import { mkdir, writeFile } from 'node:fs/promises'

const apiBase = (process.env.NEW_API_BASE_URL || 'https://mhapi.net/v1').replace(/\/+$/, '')
const token = process.env.NEW_API_TEST_TOKEN
const model = process.env.IMAGE_TEST_MODEL || 'gpt-image-2.5-flare'
const timeout = 180_000
const maxBytes = 20 * 1024 * 1024

if (!token) throw new Error('Missing GitHub Actions Secret NEW_API_TEST_TOKEN')
if (!apiBase.startsWith('https://')) throw new Error('An HTTPS API base URL is required')
console.log('Starting smoke test: 1 image generation and 1 image edit maximum')
console.log('API endpoint: ' + new URL(apiBase).origin + ' | Model: ' + model)
console.log('No credentials or image response bodies will be logged')

async function call(path, options = {}) {
  const res = await fetch(apiBase + path, {
    ...options,
    headers: { Authorization: 'Bearer ' + token, ...options.headers },
    signal: AbortSignal.timeout(timeout),
  })
  if (!res.ok) throw new Error(path + ' returned HTTP ' + res.status + ' (response body intentionally suppressed)')
  const result = await res.json().catch(() => { throw new Error(path + ' did not return valid JSON') })
  if (result.error) throw new Error(path + ' returned an upstream error (details intentionally suppressed)')
  return result
}

function mimeFrom(bytes, hint) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e) return 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg'
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  if (hint && ['image/png','image/jpeg','image/webp'].includes(hint)) return hint
  throw new Error('Image payload has an unsupported or unrecognized format')
}

async function imageFrom(result, endpoint) {
  const entry = result?.data?.[0]
  if (!entry) throw new Error(endpoint + ' returned no images')
  let bytes
  let mime
  if (entry.b64_json) {
    const text = entry.b64_json.replace(/^data:[^,]*,/, '')
    bytes = Buffer.from(text, 'base64')
  } else if (entry.url) {
    const url = new URL(entry.url)
    if (url.protocol !== 'https:' || /^(localhost|.+\.local|.+\.internal)$/i.test(url.hostname)
      || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(':')) {
      throw new Error('Upstream returned a non-public or non-HTTPS image URL')
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
    if (!res.ok) throw new Error('Image URL download failed: HTTP ' + res.status)
    if (Number(res.headers.get('content-length') || 0) > maxBytes) throw new Error('Image exceeds 20 MiB')
    bytes = Buffer.from(await res.arrayBuffer())
    mime = res.headers.get('content-type')?.split(';')[0]
  } else {
    throw new Error(endpoint + ' returned neither b64_json nor url')
  }
  if (bytes.length < 100 || bytes.length > maxBytes) throw new Error('Invalid image payload length')
  return { bytes, mime: mimeFrom(bytes, mime) }
}

async function save(name, image) {
  const ext = image.mime === 'image/jpeg' ? 'jpg' : image.mime === 'image/webp' ? 'webp' : 'png'
  await mkdir('test-output', { recursive: true })
  await writeFile('test-output/' + name + '.' + ext, image.bytes)
  console.log(name + ': valid ' + image.mime + ', ' + image.bytes.length + ' bytes')
}

console.log('Generating one 1024x1024 test image...')
const generated = await call('/images/generations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model, n: 1, size: '1024x1024',
    prompt: 'A simple original blue round toy robot on a plain white background, clean studio illustration, no text',
  }),
})
const source = await imageFrom(generated, 'generation')
await save('generation', source)
console.log('Generation: PASS')

console.log('Editing the actual generated image...')
const form = new FormData()
const ext = source.mime === 'image/jpeg' ? 'jpg' : source.mime === 'image/webp' ? 'webp' : 'png'
form.append('model', model)
form.append('prompt', 'Change the background to pale yellow, keep the same blue toy robot as the main subject')
form.append('n', '1')
form.append('size', '1024x1024')
form.append('image', new Blob([source.bytes], { type: source.mime }), 'generation.' + ext)
const edited = await call('/images/edits', { method: 'POST', body: form })
await save('edited', await imageFrom(edited, 'image edit'))
console.log('Edit generated image: PASS')
console.log('FULL IMAGE SMOKE TEST: PASS')
