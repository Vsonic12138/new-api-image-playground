import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LANGUAGE_OPTIONS, toIntlLocale } from './i18n/resources'
import { Plus, MessageCircle, Image as ImageIcon, WandSparkles, Settings2, Download, RefreshCw, Pencil, Send, Paperclip, ChevronDown, Sparkles, PanelLeftClose, PanelLeftOpen, X, Menu, Check, Info, LoaderCircle, Search, Moon, Sun } from 'lucide-react'
import type { AppSettings, AssetRef, Conversation, ImageProgressPhase, Message, WorkMode } from './types'
import { isImageModel, uuid } from './types'
import { loadConversations, loadSettings, makeConversation, SESSION_KEY, SETTINGS_KEY } from './lib/conversations'
import { createImages, editImages, importImage, isMockMode, sendChat } from './api/client'
import { ImageView } from './components/ImageView'
import { ImageLightbox } from './components/ImageLightbox'
import { EditorModal } from './components/EditorModal'
import { GenerationProgress } from './components/GenerationProgress'
import { fileFromAsset } from './lib/image-store'

function truncate(s: string, n = 30) { return s.length > n ? `${s.slice(0, n)}…` : s }
const modes: { id: WorkMode; label: string; icon: typeof ImageIcon }[] = [
  { id: 'generate', label: 'generate', icon: ImageIcon },
  { id: 'edit', label: 'edit', icon: Pencil },
  { id: 'chat', label: 'chat', icon: MessageCircle },
]

export default function App() {
  const {t, i18n} = useTranslation('imagePlayground')
  const time = (ms:number) => new Date(ms).toLocaleTimeString(toIntlLocale(i18n.resolvedLanguage || i18n.language), {hour:'2-digit',minute:'2-digit'})
  const [convos, setConvos] = useState<Conversation[]>(loadConversations)
  const [activeId, setActiveId] = useState(() => loadConversations()[0]?.id || '')
  const [settings, setSettings] = useState<AppSettings>(loadSettings)
  const [mode, setMode] = useState<WorkMode>('generate')
  const [text, setText] = useState('')
  const [selected, setSelected] = useState<AssetRef | undefined>()
  const [inspected, setInspected] = useState<AssetRef | undefined>()
  const [editorTarget, setEditorTarget] = useState<AssetRef | undefined>()
  const [editorReturnAsset, setEditorReturnAsset] = useState<AssetRef | undefined>()
  const [previewHandoff, setPreviewHandoff] = useState(false)
  const handoffTimer = useRef<number | undefined>(undefined)
  const [showSettings, setShowSettings] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('new-api-image-playground:sidebar-collapsed') === 'true')
  const [theme, setTheme] = useState<'light'|'dark'>(() => localStorage.getItem('new-api-image-playground:theme') === 'dark' ? 'dark' : 'light')
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const uploadRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const active = convos.find(c => c.id === activeId) || convos[0]

  useEffect(() => () => window.clearTimeout(handoffTimer.current), [])
  useEffect(() => { localStorage.setItem(SESSION_KEY, JSON.stringify(convos)) }, [convos])
  useEffect(() => { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) }, [settings])
  useEffect(() => { localStorage.setItem('new-api-image-playground:theme', theme) }, [theme])
  useEffect(() => { localStorage.setItem('new-api-image-playground:sidebar-collapsed', String(sidebarCollapsed)) }, [sidebarCollapsed])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [activeId, active?.messages.length])
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(timer) } }, [notice])

  const allImages = useMemo(() => (active?.messages || []).flatMap(m => m.images).reverse(), [active])
  const currentImage = selected || allImages[0]

  function modify(id: string, updater: (c: Conversation) => Conversation) {
    setConvos(old => old.map(c => c.id === id ? updater(c) : c))
  }
  function cancelHandoff() {
    window.clearTimeout(handoffTimer.current)
    setPreviewHandoff(false)
    setEditorReturnAsset(undefined)
    setEditorTarget(undefined)
  }
  function newChat() {
    cancelHandoff()
    const c = makeConversation()
    setConvos(old => [c, ...old]); setActiveId(c.id); setSelected(undefined); setInspected(undefined); setText(''); setSidebarOpen(false)
  }
  function chooseConversation(c: Conversation) {
    cancelHandoff()
    setActiveId(c.id); setSelected(undefined); setInspected(undefined); setSidebarOpen(false)
  }
  function deleteConversation(id: string) {
    cancelHandoff()
    const left = convos.filter(c => c.id !== id)
    if (!left.length) { const next = makeConversation(); setConvos([next]); setActiveId(next.id) }
    else { setConvos(left); if (activeId === id) setActiveId(left[0].id) }
    setInspected(undefined); setSelected(undefined)
  }
  async function handleUpload(file: File) {
    try { const asset = await importImage(file); setSelected(asset); setMode('edit'); setNotice(t('uploadReady')) }
    catch (e) { setNotice(e instanceof Error ? e.message : t('uploadFailed')) }
  }
  function openEditor(asset: AssetRef) {
    setEditorReturnAsset(undefined)
    setEditorTarget(asset)
    setSelected(asset)
    setMode('edit')
  }
  function editFromPreview(asset: AssetRef) {
    if (previewHandoff) return
    setPreviewHandoff(true)
    setSelected(asset)
    setMode('edit')
    setEditorReturnAsset(asset)
    window.clearTimeout(handoffTimer.current)
    handoffTimer.current = window.setTimeout(() => {
      setInspected(undefined)
      setEditorTarget(asset)
      setPreviewHandoff(false)
    }, 190)
  }
  function closeEditor() {
    setEditorTarget(undefined)
    if (editorReturnAsset) setInspected(editorReturnAsset)
    setEditorReturnAsset(undefined)
  }
  async function download(asset: AssetRef) {
    try {
      const file = await fileFromAsset(asset)
      const url = URL.createObjectURL(file)
      const link = document.createElement('a')
      link.href = url; link.download = `image-${asset.id.slice(0, 8)}.${file.type.includes('webp') ? 'webp' : file.type.includes('jpeg') ? 'jpg' : 'png'}`; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { setNotice(e instanceof Error ? e.message : t('downloadFailed')) }
  }
  function submit(prompt = text, forcedMode?: WorkMode, annotated?: Blob, target?: AssetRef) {
    const actualMode = forcedMode || mode
    const cleanPrompt = prompt.trim()
    if (!cleanPrompt || busy || !active) return
    const image = target || currentImage
    if (actualMode === 'edit' && !image) { setNotice(t('missingImage')); return }
    setBusy(true)
    setText('')
    setEditorTarget(undefined)
    setEditorReturnAsset(undefined)
    const conversationId = active.id
    const input: Message = { id: uuid(), role: 'user', mode: actualMode, text: cleanPrompt, images: actualMode === 'edit' && image ? [image] : [], createdAt: Date.now() }
    const answerId = uuid()
    const pending: Message = { id: answerId, role: 'assistant', mode: actualMode, text: '', images: [], createdAt: Date.now(), status: 'pending', progressPhase: 'preparing' }
    modify(conversationId, c => ({ ...c, title: c.messages.length ? c.title : truncate(cleanPrompt, 24), updatedAt: Date.now(), messages: [...c.messages, input, pending] }))
    const previous = active.messages
      .filter(m => m.mode === 'chat' && m.text && m.status !== 'error')
      .map(m => ({ role: m.role, content: m.text }))
    const reportProgress = (phase: ImageProgressPhase) => {
      modify(conversationId, c => ({...c, messages: c.messages.map(m => m.id === answerId ? {...m, progressPhase: phase} : m)}))
    }
    ;(async () => {
      try {
        let answer = ''
        let images: AssetRef[] = []
        if (actualMode === 'generate') {
          images = await createImages(cleanPrompt, settings, reportProgress)
          answer = t('generatedCount', {count: images.length})
        } else if (actualMode === 'edit' && image) {
          const annotatedPrompt = annotated ? `${cleanPrompt}\n参考图片上含有红色圈选标记，请理解为需要修改的位置，生成图中不要保留标记，其它部分尽可能保持一致。` : cleanPrompt
          images = await editImages(annotatedPrompt, image, settings, annotated, reportProgress)
          answer = t('editedCount', {count: images.length}) + (annotated ? ` ${t('annotationsLimit')}` : '')
        } else answer = await sendChat(cleanPrompt, previous, settings)
        modify(conversationId, c => ({ ...c, updatedAt: Date.now(), messages: c.messages.map(m => m.id === answerId ? { ...m, text: answer, images, status: 'done' as const } : m) }))
        if (images.length) setSelected(images[0])
      } catch (e) {
        const message = e instanceof Error ? e.message : '未知错误'
        modify(conversationId, c => ({ ...c, messages: c.messages.map(m => m.id === answerId ? { ...m, text: t('requestFailed', {message}), status: 'error' as const } : m) }))
      } finally { setBusy(false) }
    })()
  }

  return <div className={`app-shell ${theme === 'dark' ? 'theme-dark' : ''} ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
    <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-icon"><Sparkles size={19}/></div><div>{t('brand')}</div></div>
      <button className="new-chat-button" onClick={newChat}><Plus size={19}/>{t('newChat')}</button>
      <nav className="primary-nav"><button className="nav-active"><MessageCircle size={18}/>{t('createSpace')}</button><button onClick={() => { if (allImages[0]) setInspected(allImages[0]); else setNotice(t('clickImage')) }}><ImageIcon size={18}/>{t('myWorks')}</button><button onClick={() => setShowSettings(true)}><Settings2 size={18}/>{t('settingsModels')}</button></nav>
      <div className="history-header"><span>{t('recentChats')}</span><button onClick={newChat} title="新建"><Plus size={16}/></button></div>
      <label className="search-bar"><Search size={14}/><input placeholder={t('searchChats')} value={search} onChange={e => setSearch(e.target.value)}/></label>
      <div className="history-list">{convos.filter(c => c.title.toLowerCase().includes(search.toLowerCase())).sort((a, b) => b.updatedAt - a.updatedAt).map(c => <div className={`history-item ${active?.id === c.id ? 'selected' : ''}`} key={c.id}>
        <button className="history-name" onClick={() => chooseConversation(c)}><MessageCircle size={15}/><span>{c.title}</span></button>
        <button className="delete-chat" title={t('removeConversation')} onClick={() => deleteConversation(c.id)}><X size={14}/></button>
      </div>)}</div>
      <div className="sidebar-footer"><div className="footer-avatar">P</div><div><strong>{t('independentPreview')}</strong><small>{t('integratesLater')}</small></div></div>
    </aside>
    {sidebarOpen && <button type="button" className="sidebar-scrim" aria-label={t('closeSidebar')} onClick={() => setSidebarOpen(false)}/>}
    <div className="workspace">
      <header className="topbar"><div className="top-left">
        <button className="mobile-menu icon-button" onClick={() => setSidebarOpen(v => !v)} aria-label={t('openSidebar')}><Menu size={20}/></button>
        <button className="sidebar-toggle icon-button" onClick={() => setSidebarCollapsed(v => !v)} title={t(sidebarCollapsed ? 'expandSidebar' : 'collapseSidebar')} aria-label={t(sidebarCollapsed ? 'expandSidebar' : 'collapseSidebar')}>{sidebarCollapsed ? <PanelLeftOpen size={19}/> : <PanelLeftClose size={19}/>}</button>
        <button className="model-pill" onClick={() => setShowSettings(true)} title={t('settingsModels')}><div className="model-emoji"><WandSparkles size={17}/></div><span>{settings.imageModel}</span><ChevronDown className="model-chevron" size={14}/></button>
      </div>
        <div className="top-right"><span className={`mode-badge ${isMockMode ? 'mock' : 'real'}`}>{isMockMode ? t('demoMode') : t('liveMode')}</span><select className="language-select" aria-label="Language" value={i18n.resolvedLanguage || i18n.language} onChange={e => { void i18n.changeLanguage(e.target.value) }}>{LANGUAGE_OPTIONS.map(lang => <option key={lang.code} value={lang.code}>{lang.label}</option>)}</select><button className="icon-button theme-switch" title={theme === 'dark' ? 'Light' : 'Dark'} aria-label="Toggle theme" onClick={() => setTheme(v => v === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={17}/> : <Moon size={17}/>}</button><button className="icon-button" title={t('settings')} onClick={() => setShowSettings(true)}><Settings2 size={19}/></button><span className="user-bubble">P</span></div>
      </header>
      <div className="workspace-inner"><main className="chat-section"><div className="chat-scroll"><div className="conversation-stream">
        {(!active || !active.messages.length) && <div className="empty-state"><div className="empty-logo"><Sparkles size={30}/></div><h1>{t('startCreating')}</h1><p>{t('emptyHint')}</p><div className="inspiration-row">{(['inspiration1','inspiration2','inspiration3'] as const).map(key => <button key={key} onClick={() => { setMode('generate'); setText(t(key)) }}><WandSparkles size={14}/>{t(key)}</button>)}</div></div>}
        {active?.messages.map(message => <div key={message.id} className={`message ${message.role === 'user' ? 'user-message' : 'assistant-message'}`}>
          {message.role === 'assistant' && <div className="assistant-avatar"><Sparkles size={17}/></div>}
          <div className="message-inner"><div className="message-time">{time(message.createdAt)} · {t(message.mode)}</div>
            {message.role === 'user' ? <div className="user-bubble-text">{message.text}</div> : message.status === 'pending' ? (message.mode === 'chat'
              ? <div className="pending-answer" role="status" aria-live="polite"><div className="pending-orbit"><Sparkles size={17}/></div><span>{t('responding')}</span><span className="pending-dots" aria-hidden="true"><i/><i/><i/></span></div>
              : <GenerationProgress mode={message.mode} phase={message.progressPhase} startedAt={message.createdAt}/>) : <div className={`assistant-text ${message.status === 'error' ? 'error-text' : ''}`}>{message.text}</div>}
            {message.images.length > 0 && <div className={`result-images ${message.role === 'user' ? 'user-images' : ''}`}>{message.images.map(image => <div key={image.id} className="result-image-item"><ImageView asset={image} onClick={() => { setInspected(image); setSelected(image) }}/>
              {message.role === 'assistant' && <div className="image-actions"><button onClick={() => openEditor(image)} title={t('continueEdit')}><Pencil size={16}/>{t('continueEdit')}</button><button onClick={() => { const previousPrompt = [...active.messages].filter(m => m.role === 'user' && m.createdAt <= message.createdAt).at(-1)?.text; if (previousPrompt) submit(previousPrompt, 'generate') }} title={t('regenerate')}><RefreshCw size={16}/>{t('regenerate')}</button><button onClick={() => download(image)} title={t('download')}><Download size={16}/></button></div>}
            </div>)}</div>}
          </div></div>)}<div ref={bottomRef}/>
      </div></div>
      <div className="composer-area"><div className="composer"><div className="composer-tabs">{modes.map(m => <button key={m.id} className={mode === m.id ? 'active' : ''} onClick={() => setMode(m.id)}><m.icon size={15}/>{t(m.id)}</button>)}</div>
        <textarea rows={2} aria-label={mode === 'generate' ? t('generatePlaceholder') : mode === 'edit' ? t('editPlaceholder') : t('chatPlaceholder')} placeholder={mode === 'generate' ? t('generatePlaceholder') : mode === 'edit' ? t('editPlaceholder') : t('chatPlaceholder')} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() } }}/>
        <div className="composer-bottom"><div className="composer-left"><input ref={uploadRef} className="hidden-input" type="file" accept="image/*" onChange={e => { const file = e.target.files?.[0]; if (file) void handleUpload(file); e.target.value = '' }}/><button className="secondary-button" onClick={() => uploadRef.current?.click()}><Paperclip size={16}/>{t('upload')}</button>{selected && <div className="picked-image"><ImageView asset={selected}/><span>{t('selectedReference')}</span><button title={t('removeReference')} onClick={() => setSelected(undefined)}><X size={13}/></button></div>}</div><div className="composer-right"><button className="icon-button" title={t('generationParams')} onClick={() => setShowSettings(true)}><Settings2 size={18}/></button><button className="primary-button send-button" disabled={!text.trim() || busy} onClick={() => submit()} aria-label={t('send')}>{busy ? <LoaderCircle className="spin" size={16}/> : <Send size={16}/>}<span>{t('send')}</span></button></div></div>
      </div><div className="composer-tip"><span>{isMockMode ? t('mockTip') : t('relayTip')}</span><span className="local-data-tip">· {t('localDataHint')}</span></div></div>
    </main>
    </div>
    </div>
    {showSettings && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setShowSettings(false) }}><div className="settings-modal" role="dialog" aria-modal="true"><div className="settings-head"><h2>{t('settingsTitle')}</h2><button className="icon-button" onClick={() => setShowSettings(false)}><X size={20}/></button></div><p className="muted">{t('settingsDesc')}</p>
      <label>{t('imageModel')}<select value={settings.imageModel} onChange={e => { if (isImageModel(e.target.value)) setSettings(s => ({...s, imageModel:e.target.value as typeof s.imageModel})) }}><option value="gpt-image-2.5-flare">gpt-image-2.5-flare</option><option value="gpt-image-2.5-sunburst">gpt-image-2.5-sunburst</option></select></label>
      <label>{t('chatModel')}<input value={settings.chatModel} onChange={e => setSettings(s => ({ ...s, chatModel: e.target.value }))}/></label>
      <label>{t('imageSize')}<select value={settings.size} onChange={e => setSettings(s => ({ ...s, size: e.target.value }))}><option value="1024x1024">1024 × 1024</option><option value="1536x1024">1536 × 1024</option><option value="1024x1536">1024 × 1536</option><option value="auto">auto（由上游决定）</option></select></label>
      <label>{t('imageNumber')}<select value={settings.count} onChange={e => setSettings(s => ({ ...s, count: Number(e.target.value) }))}><option value={1}>1 张</option><option value={2}>2 张</option><option value={3}>3 张</option><option value={4}>4 张</option></select></label>
      <div className="notice-box"><Info size={16}/><div>{t('upstreamCompatibilityNote')}</div></div>
      <button className="primary-button settings-done" onClick={() => setShowSettings(false)}><Check size={16}/>{t('saveSettings')}</button></div></div>}
    {inspected && <ImageLightbox image={inspected} images={allImages} imageModel={settings.imageModel} transitioningToEditor={previewHandoff} onClose={() => {if (!previewHandoff) setInspected(undefined)}} onSelect={image => { if (!previewHandoff) {setInspected(image);setSelected(image)} }} onEdit={editFromPreview} onDownload={image => { void download(image) }}/>}
    {editorTarget && <EditorModal asset={editorTarget} fromPreview={!!editorReturnAsset} onClose={closeEditor} onSubmit={(prompt, annotated) => submit(prompt, 'edit', annotated, editorTarget)}/>}
    {notice && <div className="toast"><Info size={16}/>{notice}<button onClick={() => setNotice('')}><X size={14}/></button></div>}
  </div>
}
