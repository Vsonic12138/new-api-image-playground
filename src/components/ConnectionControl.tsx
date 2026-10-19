import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Lock, LogOut, LoaderCircle, PlugZap, X } from 'lucide-react'

export function ConnectionControl({onModels}: {onModels:(models:string[])=>void}) {
  const [connected,setConnected] = useState(false)
  const [open,setOpen] = useState(false)
  const [token,setToken] = useState('')
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState('')
  const [expiry,setExpiry] = useState<number|null>(null)

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/connection',{credentials:'same-origin',cache:'no-store'})
      const data = await res.json()
      setConnected(Boolean(data.connected))
      setExpiry(typeof data.expiresAt === 'number' ? data.expiresAt : null)
      if (data.connected) {
        const modelRes = await fetch('/api/models',{credentials:'same-origin',cache:'no-store'})
        if (modelRes.ok) {
          const list = await modelRes.json()
          onModels(Array.isArray(list?.data) ? list.data.map((m:any)=>m.id).filter((m:unknown):m is string=>typeof m==='string') : [])
        }
      } else onModels([])
    } catch { setConnected(false) }
  },[onModels])

  useEffect(() => { void loadStatus() },[loadStatus])

  const connect = async () => {
    if (!token.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/connection', {
        method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({token:token.trim()}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error?.message || '连接失败')
      setToken('')
      setOpen(false)
      await loadStatus()
    } catch(e) { setError(e instanceof Error ? e.message : '连接失败') }
    finally { setLoading(false) }
  }
  const disconnect = async () => {
    await fetch('/api/connection',{method:'DELETE',credentials:'same-origin'}).catch(()=>{})
    setToken('');setExpiry(null);setConnected(false);onModels([]);setOpen(false)
  }

  return <>
    <button className={`connection-pill ${connected ? 'online' : ''}`} type="button" onClick={()=>setOpen(true)}>
      {connected ? <PlugZap size={15}/> : <KeyRound size={15}/>}
      {connected ? '已连接 NewAPI' : '连接我的 Key'}
    </button>
    {open && <div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}>
      <div className="connection-modal" role="dialog" aria-modal="true" aria-label="连接 NewAPI">
        <header><div><strong>连接我的 NewAPI Token</strong><p>使用你自己创建、限制额度和模型权限的 Key</p></div><button aria-label="关闭连接设置" type="button" onClick={()=>setOpen(false)}><X size={19}/></button></header>
        {connected ? <>
          <div className="connection-state"><PlugZap size={18}/><div><strong>已连接</strong><small>{expiry ? `会话有效期至 ${new Date(expiry).toLocaleString()}` : '临时会话已启用'}</small></div></div>
          <p className="connection-explain">Key 仅保存在当前独立服务的内存会话中，不会写入浏览器的图片/聊天记录。</p>
          <button className="connection-logout" type="button" onClick={()=>void disconnect()}><LogOut size={16}/>断开连接</button>
        </> : <>
          <label className="connection-label" htmlFor="pg-token">NewAPI 用户 Key</label>
          <input id="pg-token" autoComplete="off" type="password" placeholder="粘贴你自己创建的低额度 Key" value={token} onChange={e=>setToken(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void connect()}}/>
          <p className="connection-explain"><Lock size={14}/>只连接服务器管理员预设的 NewAPI 地址。Key 不写入 localStorage、GitHub Pages 或前端打包文件；关闭会话或重启服务后失效。</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button connection-submit" type="button" disabled={loading||!token.trim()} onClick={()=>void connect()}>{loading?<LoaderCircle size={16} className="spin"/>:<PlugZap size={16}/>}连接并读取我的模型</button>
        </>}
      </div>
    </div>}
  </>
}
