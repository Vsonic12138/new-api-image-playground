import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, MessageCircle, Image as ImageIcon, WandSparkles, Settings2, Download, RefreshCw, Pencil, Send, Paperclip, ChevronDown, Sparkles, PanelRightClose, X, Menu, History, Check, Info, LoaderCircle, Search } from 'lucide-react'
import type { AppSettings, AssetRef, Conversation, Message, WorkMode } from './types'
import { uuid } from './types'
import { loadConversations, loadSettings, makeConversation, SESSION_KEY, SETTINGS_KEY } from './lib/conversations'
import { createImages, editImages, importImage, isMockMode, modeLabel, sendChat } from './api/client'
import { ImageView } from './components/ImageView'
import { EditorModal } from './components/EditorModal'
import { fileFromAsset } from './lib/image-store'

function time(ms: number) { return new Date(ms).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }
function truncate(s: string, n = 30) { return s.length > n ? `${s.slice(0, n)}…` : s }
const modes: { id: WorkMode; label: string; icon: typeof ImageIcon }[] = [
  { id: 'generate', label: '生图', icon: ImageIcon },
  { id: 'edit', label: '修图', icon: Pencil },
  { id: 'chat', label: '对话', icon: MessageCircle },
]

export default function App() {
  const [convos, setConvos] = useState<Conversation[]>(loadConversations)
  const [activeId, setActiveId] = useState(() => loadConversations()[0]?.id || '')
  const [settings, setSettings] = useState<AppSettings>(loadSettings)
  const [mode, setMode] = useState<WorkMode>('generate')
  const [text, setText] = useState('')
  const [selected, setSelected] = useState<AssetRef | undefined>()
  const [inspected, setInspected] = useState<AssetRef | undefined>()
  const [editorTarget, setEditorTarget] = useState<AssetRef | undefined>()
  const [showSettings, setShowSettings] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const uploadRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const active = convos.find(c => c.id === activeId) || convos[0]

  useEffect(() => { localStorage.setItem(SESSION_KEY, JSON.stringify(convos)) }, [convos])
  useEffect(() => { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) }, [settings])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [activeId, active?.messages.length])
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(timer) } }, [notice])

  const allImages = useMemo(() => (active?.messages || []).flatMap(m => m.images).reverse(), [active])
  const currentImage = selected || allImages[0]
  const inspectedIndex = inspected ? allImages.findIndex(i => i.id === inspected.id) : -1

  function modify(id: string, updater: (c: Conversation) => Conversation) {
    setConvos(old => old.map(c => c.id === id ? updater(c) : c))
  }
  function newChat() {
    const c = makeConversation()
    setConvos(old => [c, ...old]); setActiveId(c.id); setSelected(undefined); setInspected(undefined); setText(''); setSidebarOpen(false)
  }
  function chooseConversation(c: Conversation) {
    setActiveId(c.id); setSelected(undefined); setInspected(undefined); setSidebarOpen(false)
  }
  function deleteConversation(id: string) {
    const left = convos.filter(c => c.id !== id)
    if (!left.length) { const next = makeConversation(); setConvos([next]); setActiveId(next.id) }
    else { setConvos(left); if (activeId === id) setActiveId(left[0].id) }
    setInspected(undefined); setSelected(undefined)
  }
  async function handleUpload(file: File) {
    try { const asset = await importImage(file); setSelected(asset); setMode('edit'); setNotice('已载入图片，可以直接输入编辑要求，也可以点击“圈选标注”') }
    catch (e) { setNotice(e instanceof Error ? e.message : '图片上传失败') }
  }
  function openEditor(asset: AssetRef) { setEditorTarget(asset); setSelected(asset); setMode('edit') }
  async function download(asset: AssetRef) {
    try {
      const file = await fileFromAsset(asset)
      const url = URL.createObjectURL(file)
      const link = document.createElement('a')
      link.href = url; link.download = `image-${asset.id.slice(0, 8)}.${file.type.includes('webp') ? 'webp' : file.type.includes('jpeg') ? 'jpg' : 'png'}`; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { setNotice(e instanceof Error ? e.message : '下载失败') }
  }
  function submit(prompt = text, forcedMode?: WorkMode, annotated?: Blob, target?: AssetRef) {
    const actualMode = forcedMode || mode
    const cleanPrompt = prompt.trim()
    if (!cleanPrompt || busy || !active) return
    const image = target || currentImage
    if (actualMode === 'edit' && !image) { setNotice('请先上传或选择一张图片，再使用修图模式'); return }
    setBusy(true)
    setText('')
    setEditorTarget(undefined)
    const conversationId = active.id
    const input: Message = { id: uuid(), role: 'user', mode: actualMode, text: cleanPrompt, images: actualMode === 'edit' && image ? [image] : [], createdAt: Date.now() }
    const answerId = uuid()
    const pending: Message = { id: answerId, role: 'assistant', mode: actualMode, text: '', images: [], createdAt: Date.now(), status: 'pending' }
    modify(conversationId, c => ({ ...c, title: c.messages.length ? c.title : truncate(cleanPrompt, 24), updatedAt: Date.now(), messages: [...c.messages, input, pending] }))
    const previous = active.messages
      .filter(m => m.mode === 'chat' && m.text && m.status !== 'error')
      .map(m => ({ role: m.role, content: m.text }))
    ;(async () => {
      try {
        let answer = ''
        let images: AssetRef[] = []
        if (actualMode === 'generate') {
          images = await createImages(cleanPrompt, settings)
          answer = `已为你生成 ${images.length} 张图片。可以继续编辑、再次生成或下载。`
        } else if (actualMode === 'edit' && image) {
          const annotatedPrompt = annotated ? `${cleanPrompt}\n参考图片上含有红色圈选标记，请理解为需要修改的位置，生成图中不要保留标记，其它部分尽可能保持一致。` : cleanPrompt
          images = await editImages(annotatedPrompt, image, settings, annotated)
          answer = `编辑完成，已生成 ${images.length} 张新图片。${annotated ? '注意：本次为标注辅助的整图编辑，并非 Mask 局部重绘。' : ''}`
        } else answer = await sendChat(cleanPrompt, previous, settings)
        modify(conversationId, c => ({ ...c, updatedAt: Date.now(), messages: c.messages.map(m => m.id === answerId ? { ...m, text: answer, images, status: 'done' as const } : m) }))
        if (images.length) { setSelected(images[0]); setInspected(images[0]) }
      } catch (e) {
        const message = e instanceof Error ? e.message : '未知错误'
        modify(conversationId, c => ({ ...c, messages: c.messages.map(m => m.id === answerId ? { ...m, text: `请求失败：${message}`, status: 'error' as const } : m) }))
      } finally { setBusy(false) }
    })()
  }

  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-icon"><Sparkles size={19}/></div><div>AI 创作 <span>Playground</span></div></div>
      <button className="new-chat-button" onClick={newChat}><Plus size={19}/>新建对话 <kbd>⌘ K</kbd></button>
      <nav className="primary-nav"><button className="nav-active"><MessageCircle size={18}/>创作空间</button><button onClick={() => setInspected(allImages[0])}><ImageIcon size={18}/>我的作品</button><button onClick={() => setShowSettings(true)}><Settings2 size={18}/>设置与模型</button></nav>
      <div className="history-header"><span>最近对话</span><button onClick={newChat} title="新建"><Plus size={16}/></button></div>
      <label className="search-bar"><Search size={14}/><input placeholder="搜索对话…" value={search} onChange={e => setSearch(e.target.value)}/></label>
      <div className="history-list">{convos.filter(c => c.title.toLowerCase().includes(search.toLowerCase())).sort((a, b) => b.updatedAt - a.updatedAt).map(c => <div className={`history-item ${active?.id === c.id ? 'selected' : ''}`} key={c.id}>
        <button className="history-name" onClick={() => chooseConversation(c)}><MessageCircle size={15}/><span>{c.title}</span></button>
        <button className="delete-chat" title="删除对话" onClick={() => deleteConversation(c.id)}><X size={14}/></button>
      </div>)}</div>
      <div className="sidebar-footer"><div className="footer-avatar">P</div><div><strong>独立开发预览</strong><small>后续集成 New API</small></div></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="top-left"><button className="mobile-menu icon-button" onClick={() => setSidebarOpen(v => !v)}><Menu size={20}/></button><div className="model-pill"><div className="model-emoji"><WandSparkles size={17}/></div><span>{settings.imageModel}</span><ChevronDown size={14}/></div></div>
        <div className="top-modes">{modes.map(m => <button key={m.id} className={mode === m.id ? 'active' : ''} onClick={() => setMode(m.id)}><m.icon size={17}/>{m.label}</button>)}</div>
        <div className="top-right"><span className={`mode-badge ${isMockMode ? 'mock' : 'real'}`}>{isMockMode ? '演示模式' : 'New API 已启用'}</span><button className="icon-button" title="设置" onClick={() => setShowSettings(true)}><Settings2 size={19}/></button><span className="user-bubble">P</span></div>
      </header>
      <div className="workspace-inner"><main className="chat-section"><div className="chat-scroll"><div className="conversation-stream">
        {(!active || !active.messages.length) && <div className="empty-state"><div className="empty-logo"><Sparkles size={30}/></div><h1>用一句话开始创作</h1><p>生成图片、上传参考图继续编辑，或和 AI 自然对话。</p><div className="inspiration-row">{['雨后的赛博朋克街道', '温暖治愈的3D卡通插画', '设计一张极简咖啡海报'].map(example => <button key={example} onClick={() => { setMode('generate'); setText(example) }}><WandSparkles size={14}/>{example}</button>)}</div></div>}
        {active?.messages.map(message => <div key={message.id} className={`message ${message.role === 'user' ? 'user-message' : 'assistant-message'}`}>
          {message.role === 'assistant' && <div className="assistant-avatar"><Sparkles size={17}/></div>}
          <div className="message-inner"><div className="message-time">{time(message.createdAt)} · {modeLabel(message.mode)}</div>
            {message.role === 'user' ? <div className="user-bubble-text">{message.text}</div> : message.status === 'pending' ? <div className="pending-answer"><LoaderCircle className="spin" size={17}/> AI 正在{message.mode === 'generate' ? '生成图片' : message.mode === 'edit' ? '修改图片' : '回复'}…</div> : <div className={`assistant-text ${message.status === 'error' ? 'error-text' : ''}`}>{message.text}</div>}
            {message.images.length > 0 && <div className={`result-images ${message.role === 'user' ? 'user-images' : ''}`}>{message.images.map(image => <div key={image.id} className="result-image-item"><ImageView asset={image} onClick={() => { setInspected(image); setSelected(image) }}/>
              {message.role === 'assistant' && <div className="image-actions"><button onClick={() => openEditor(image)} title="继续编辑"><Pencil size={16}/>继续编辑</button><button onClick={() => { const previousPrompt = [...active.messages].filter(m => m.role === 'user' && m.createdAt <= message.createdAt).at(-1)?.text; if (previousPrompt) submit(previousPrompt, 'generate') }} title="再次生成"><RefreshCw size={16}/>再次生成</button><button onClick={() => download(image)} title="下载"><Download size={16}/></button></div>}
            </div>)}</div>}
          </div></div>)}<div ref={bottomRef}/>
      </div></div>
      <div className="composer-area"><div className="composer"><div className="composer-tabs">{modes.map(m => <button key={m.id} className={mode === m.id ? 'active' : ''} onClick={() => setMode(m.id)}><m.icon size={15}/>{m.label}</button>)}</div>
        <textarea rows={2} placeholder={mode === 'generate' ? '描述想生成的图片，例如：温暖午后的卡通机器人猫…' : mode === 'edit' ? '描述如何修改所选图片，例如：把背景改成海边日落…' : '向 AI 发送消息…'} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit() } }}/>
        <div className="composer-bottom"><div className="composer-left"><input ref={uploadRef} className="hidden-input" type="file" accept="image/*" onChange={e => { const file = e.target.files?.[0]; if (file) void handleUpload(file); e.target.value = '' }}/><button className="secondary-button" onClick={() => uploadRef.current?.click()}><Paperclip size={16}/>上传图片</button>{selected && <div className="picked-image"><ImageView asset={selected}/><span>已选择参考图</span><button title="清除" onClick={() => setSelected(undefined)}><X size={13}/></button></div>}</div><div className="composer-right"><button className="icon-button" title="生成参数" onClick={() => setShowSettings(true)}><Settings2 size={18}/></button><button className="primary-button send-button" disabled={!text.trim() || busy} onClick={() => submit()}><Send size={16}/>发送</button></div></div>
      </div><div className="composer-tip">{isMockMode ? 'Mock 演示模式：图片与回复为预置示例，不会发起真实 API 调用。' : '真实调用通过本地服务端代理发起；请勿在浏览器代码中写入上游密钥。'}</div></div>
    </main>
    <aside className="inspector"><div className="inspector-header"><strong>图片详情</strong><button className="icon-button" onClick={() => setInspected(undefined)} title="清除选中"><PanelRightClose size={18}/></button></div>
      {inspected ? <div className="inspector-body"><ImageView asset={inspected} className="inspector-hero"/><h4>当前图片</h4><div className="asset-metadata"><div><span>图片 ID</span><span className="mono">{truncate(inspected.id, 15)}</span></div><div><span>图像模型</span><span>{settings.imageModel}</span></div><div><span>操作</span><span>{inspected.parentId ? '基于图片编辑' : '图片生成'}</span></div><div><span>创建时间</span><span>{time(inspected.createdAt)}</span></div></div><div className="inspector-buttons"><button onClick={() => openEditor(inspected)}><Pencil size={15}/>继续编辑</button><button onClick={() => download(inspected)}><Download size={15}/>下载</button></div>
      {inspectedIndex >= 0 && <p className="inspector-hint"><Check size={14}/>已选择这张图片作为当前编辑参考。</p>}</div> : <div className="inspector-blank"><ImageIcon size={24}/><p>点击任意图片查看详情</p></div>}
      {allImages.length > 0 && <div className="inspector-history"><div className="section-title"><History size={16}/>图片历史<span>{allImages.length} 张</span></div><div className="history-gallery">{allImages.map(image => <ImageView key={image.id} asset={image} className={inspected?.id === image.id ? 'active' : ''} onClick={() => { setInspected(image); setSelected(image) }}/>)}</div></div>}
    </aside></div>
    </div>
    {showSettings && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setShowSettings(false) }}><div className="settings-modal" role="dialog" aria-modal="true"><div className="settings-head"><h2>模型与生成设置</h2><button className="icon-button" onClick={() => setShowSettings(false)}><X size={20}/></button></div><p className="muted">使用第三方 OpenAI 兼容中转，生成与编辑共用同一个图像模型。</p>
      <label>图像模型<input value={settings.imageModel} onChange={e => setSettings(s => ({ ...s, imageModel: e.target.value }))}/></label>
      <label>聊天模型<input value={settings.chatModel} onChange={e => setSettings(s => ({ ...s, chatModel: e.target.value }))}/></label>
      <label>图片尺寸<select value={settings.size} onChange={e => setSettings(s => ({ ...s, size: e.target.value }))}><option value="1024x1024">1024 × 1024</option><option value="1536x1024">1536 × 1024</option><option value="1024x1536">1024 × 1536</option><option value="auto">auto（由上游决定）</option></select></label>
      <label>生成数量<select value={settings.count} onChange={e => setSettings(s => ({ ...s, count: Number(e.target.value) }))}><option value={1}>1 张</option><option value={2}>2 张</option><option value={3}>3 张</option><option value={4}>4 张</option></select></label>
      <div className="notice-box"><Info size={16}/><div>某些图像模型不支持 n、auto 或特定尺寸；请以你的上游协议实际能力为准。<br/>当前模式：{isMockMode ? 'Mock（无需密钥）' : 'Relay（连接 New API）'}。</div></div>
      <button className="primary-button settings-done" onClick={() => setShowSettings(false)}><Check size={16}/>保存设置</button></div></div>}
    {editorTarget && <EditorModal asset={editorTarget} onClose={() => setEditorTarget(undefined)} onSubmit={(prompt, annotated) => submit(prompt, 'edit', annotated, editorTarget)}/>}
    {notice && <div className="toast"><Info size={16}/>{notice}<button onClick={() => setNotice('')}><X size={14}/></button></div>}
  </div>
}
