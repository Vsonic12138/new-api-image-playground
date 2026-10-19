import { useCallback, useEffect, useState } from 'react'
import { KeyRound, ShieldCheck, X } from 'lucide-react'
import { setEmbeddedCredential } from '../api/protocols'

type TokenChoice = {
  id:number; name:string; group:string; key?:string;status:number
  model_limits_enabled?:boolean;model_limits?:string
}
type GroupChoice = {id:string;name:string}
type Props = {onModels:(models:string[])=>void}

export function EmbeddedCredentialControl({onModels}:Props) {
  const [open,setOpen] = useState(false)
  const [tokens,setTokens] = useState<TokenChoice[]>([])
  const [groups,setGroups] = useState<GroupChoice[]>([])
  const [mode,setMode] = useState<'account'|'token'>('account')
  const [tokenId,setTokenId] = useState<number|undefined>()
  const [group,setGroup] = useState('')
  const [error,setError] = useState('')
  const selectedToken = tokens.find(t=>t.id===tokenId)
  const apply = useCallback(async(
    selection:{mode:'account';group?:string}|{mode:'token';tokenId:number},
  )=>{
    setEmbeddedCredential(selection)
    try {
      // Models are sourced from NewAPI's per-user allowed model catalogue.
      // The actual image request is always validated again on the backend.
      const url = new URL('/api/user/models',window.location.origin)
      if (selection.mode==='account' && selection.group) url.searchParams.set('group',selection.group)
      const res = await fetch(url.pathname+url.search,{credentials:'same-origin'})
      const data = await res.json()
      const models: unknown = data?.data
      onModels(Array.isArray(models) ? models.filter((v):v is string=>typeof v==='string') : [])
    } catch {onModels([])}
  },[onModels])

  useEffect(()=>{
    let active=true
    ;(async()=>{
      try{
        const [tokenRes,groupRes] = await Promise.all([
          fetch('/api/token/?p=1&page_size=100',{credentials:'same-origin'}),
          fetch('/api/user/self/groups',{credentials:'same-origin'}),
        ])
        if (!tokenRes.ok || !groupRes.ok) throw new Error('读取当前用户权限失败')
        const [tokenBody,groupBody]=await Promise.all([tokenRes.json(),groupRes.json()])
        if (!active) return
        const tokenData=tokenBody?.data
        const tokenItems=Array.isArray(tokenData?.items)?tokenData.items:Array.isArray(tokenData)?tokenData:[]
        setTokens(tokenItems.filter((v:any)=>typeof v?.id==='number'))
        const groupData=groupBody?.data
        if(groupData&&typeof groupData==='object'&&!Array.isArray(groupData)) {
          setGroups(Object.entries(groupData).map(([id,desc])=>({id,name:typeof desc==='object'&&desc&&'desc' in desc?String((desc as any).desc):id})))
        }
        void apply({mode:'account'})
      }catch(e){if(active)setError(e instanceof Error?e.message:'读取用户信息失败')}
    })()
    return ()=>{active=false;setEmbeddedCredential({mode:'account'})}
  },[apply])

  const chooseAccount = (value:string) => {
    setMode('account');setGroup(value);setTokenId(undefined)
    void apply({mode:'account',group:value||undefined})
  }
  const chooseToken = (value:string) => {
    const next=Number(value)
    if(!Number.isInteger(next)||next<=0)return
    setMode('token');setTokenId(next)
    setGroup('')
    void apply({mode:'token',tokenId:next})
  }
  return <>
    <button type="button" className="connection-pill online" onClick={()=>setOpen(true)}>
      <ShieldCheck size={15}/>{mode==='token'&&selectedToken?selectedToken.name:'NewAPI 账号'}
    </button>
    {open&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}>
      <div className="connection-modal" role="dialog" aria-modal="true" aria-label="NewAPI 账户和 Token 选择">
        <header><div><strong>NewAPI 调用身份</strong><p>仅选择当前登录账号已有的 Token，密钥不会传给浏览器</p></div><button type="button" aria-label="关闭" onClick={()=>setOpen(false)}><X size={19}/></button></header>
        <label className="connection-label">调用方式</label>
        <div className="connection-choice-row">
          <button className={mode==='account'?'active':''} type="button" onClick={()=>chooseAccount(group)}>使用账号</button>
          <button className={mode==='token'?'active':''} type="button" onClick={()=>{if(tokenId)chooseToken(String(tokenId));else if(tokens.length)chooseToken(String(tokens[0].id));else setMode('token')}}>使用我的 Key</button>
        </div>
        {mode==='account' ? <>
          <label className="connection-label" htmlFor="pg-user-group">授权分组</label>
          <select id="pg-user-group" value={group} onChange={e=>chooseAccount(e.target.value)}><option value="">使用账号默认分组</option>{groups.map(g=><option value={g.id} key={g.id}>{g.id}{g.name!==g.id?' · '+g.name:''}</option>)}</select>
        </> : <>
          <label className="connection-label" htmlFor="pg-user-token">我的 API Key（不会显示原文）</label>
          <select id="pg-user-token" value={tokenId||''} onChange={e=>chooseToken(e.target.value)}>
            <option value="" disabled>选择已有 Key</option>
            {tokens.map(t=><option value={t.id} key={t.id}>{t.name} · {t.key||'已遮盖'} · {t.group||'默认'}</option>)}
          </select>
          {selectedToken&&<p className="connection-explain"><KeyRound size={14}/>Key 绑定分组：{selectedToken.group||'账号默认'}。请求时仍会重新检查额度、有效期及模型限制。</p>}
        </>}
        {error&&<p className="form-error" role="alert">{error}</p>}
        <button className="primary-button connection-submit" type="button" onClick={()=>setOpen(false)}>完成</button>
      </div>
    </div>}
  </>
}
