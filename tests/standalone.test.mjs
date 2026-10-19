import assert from 'node:assert/strict'
import { test } from 'node:test'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'

const listen = async server => {
  server.listen(0,'127.0.0.1')
  await once(server,'listening')
  return server.address().port
}
const stop = async server => new Promise(resolve=>server.close(resolve))
async function waitUntil(url) {
  for(let n=0;n<60;n++) {
    try { const response=await fetch(url);if(response.status!==502)return } catch {}
    await new Promise(resolve=>setTimeout(resolve,100))
  }
  throw new Error('Standalone server did not start')
}

test('standalone BYOK proxy authenticates, isolates credentials and checks origins',async()=>{
  const upstreamAuth=[]
  const upstream=http.createServer((req,res)=>{
    upstreamAuth.push(req.headers.authorization)
    res.setHeader('Content-Type','application/json')
    if(req.headers.authorization!=='Bearer sk-test-user-token') {
      res.writeHead(401);res.end(JSON.stringify({error:{message:'invalid token'}}));return
    }
    if(req.url==='/v1/models'){res.end(JSON.stringify({data:[{id:'gpt-5'},{id:'gpt-image-2.5-flare'}]}));return}
    if(req.url==='/v1/chat/completions'){res.end(JSON.stringify({choices:[{message:{content:'hello'}}]}));return}
    res.writeHead(404);res.end(JSON.stringify({error:{message:'missing'}}))
  })
  const upstreamPort=await listen(upstream)
  const serverPort=upstreamPort+1
  const child=spawn(process.execPath,['server/standalone.mjs'],{
    cwd:process.cwd(),
    env:{...process.env,PORT:String(serverPort),HOST:'127.0.0.1',NODE_ENV:'development',UPSTREAM_API_BASE_URL:`http://127.0.0.1:${upstreamPort}/v1`},
    stdio:['ignore','pipe','pipe'],
  })
  const base=`http://127.0.0.1:${serverPort}`
  const origin=base
  try{
    await waitUntil(base+'/api/connection')
    let response=await fetch(base+'/api/models')
    assert.equal(response.status,401,'unconnected requests must be rejected')
    response=await fetch(base+'/api/connection',{
      method:'POST',headers:{'Content-Type':'application/json',Origin:'https://attacker.example'},
      body:JSON.stringify({token:'sk-test-user-token'}),
    })
    assert.equal(response.status,403,'cross-site connect should be rejected')
    response=await fetch(base+'/api/connection',{
      method:'POST',headers:{'Content-Type':'application/json',Origin:origin},
      body:JSON.stringify({token:'sk-wrong-user-token'}),
    })
    assert.equal(response.status,401,'invalid upstream user key should be rejected')
    response=await fetch(base+'/api/connection',{
      method:'POST',headers:{'Content-Type':'application/json',Origin:origin},
      body:JSON.stringify({token:'sk-test-user-token'}),
    })
    assert.equal(response.status,200)
    const cookie=response.headers.get('set-cookie')
    assert.match(cookie,/HttpOnly/)
    assert.match(cookie,/SameSite=Strict/)
    assert.ok(!cookie.includes('sk-test-user-token'),'cookie must never contain user key')
    response=await fetch(base+'/api/models',{headers:{Cookie:cookie}})
    assert.equal(response.status,200)
    assert.deepEqual((await response.json()).data.map(m=>m.id),['gpt-5','gpt-image-2.5-flare'])
    response=await fetch(base+'/api/relay/v1/chat/completions',{
      method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},
      body:JSON.stringify({model:'gpt-5',messages:[{role:'user',content:'Hello'}]}),
    })
    assert.equal(response.status,200)
    assert.equal((await response.json()).choices[0].message.content,'hello')
    // A browser can bypass dropdown restrictions, so the BFF must reject
    // unsupported image models before contacting the upstream at all.
    const countBefore=upstreamAuth.length
    response=await fetch(base+'/api/relay/v1/images/generations',{
      method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},
      body:JSON.stringify({model:'gpt-image-2',prompt:'test'}),
    })
    assert.equal(response.status,400)
    assert.equal(upstreamAuth.length,countBefore,'invalid image model must not reach upstream')
    const edit=new FormData()
    edit.append('model','gpt-image-2')
    edit.append('prompt','test')
    edit.append('image',new Blob(['image bytes'],{type:'image/png'}),'image.png')
    response=await fetch(base+'/api/relay/v1/images/edits',{
      method:'POST',headers:{Cookie:cookie,Origin:origin},body:edit,
    })
    assert.equal(response.status,400)
    assert.equal(upstreamAuth.length,countBefore,'invalid edit model must not reach upstream')
    response=await fetch(base+'/api/relay/v1/responses',{
      method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},
      body:JSON.stringify({model:'gpt-5',input:'test',tools:[{type:'image_generation',model:'gpt-image-2'}]}),
    })
    assert.equal(response.status,400)
    assert.equal(upstreamAuth.length,countBefore,'invalid Responses tool must not reach upstream')
    response=await fetch(base+'/api/relay/v1/responses',{
      method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},
      body:JSON.stringify({model:'gpt-5',input:'text only'}),
    })
    assert.equal(response.status,404,'ordinary Responses LLMs must not be blocked by image allowlist')
    response=await fetch(base+'/api/relay/v1/unknown',{
      method:'POST',headers:{Cookie:cookie,Origin:origin},
    })
    assert.equal(response.status,404,'proxy endpoint allowlist must be enforced')
    response=await fetch(base+'/api/connection',{method:'DELETE',headers:{Cookie:cookie,Origin:origin}})
    assert.equal(response.status,200)
    response=await fetch(base+'/api/models',{headers:{Cookie:cookie}})
    assert.equal(response.status,401,'disconnect should revoke server session')
    assert.ok(upstreamAuth.every(v=>v==='Bearer sk-test-user-token'||v==='Bearer sk-wrong-user-token'))
  } finally{
    child.kill('SIGTERM')
    await Promise.race([once(child,'exit'),new Promise(resolve=>setTimeout(resolve,500))]).catch(()=>{})
    await stop(upstream)
  }
})
