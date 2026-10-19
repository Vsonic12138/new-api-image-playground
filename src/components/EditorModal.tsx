import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Check, Info, LoaderCircle, PenLine, RotateCcw, Send, SquareDashed, Trash2, X } from 'lucide-react'
import { Stage, Layer, Image as KonvaImage, Line, Rect } from 'react-konva'
import type Konva from 'konva'
import type { AssetRef } from '../types'
import { getBlob } from '../lib/image-store'

type Shape = { kind: 'pen'; points: number[]; strokeWidth: number } | { kind: 'rect'; x: number; y: number; width: number; height: number; strokeWidth: number }
type Props = { asset: AssetRef; onClose: () => void; onSubmit: (prompt: string, annotatedImage?: Blob) => void; fromPreview?: boolean }
type Tool = 'pen' | 'rect'
type Point = {x: number; y: number}

export function EditorModal({ asset, onClose, onSubmit, fromPreview = false }: Props) {
  const { t } = useTranslation('imagePlayground')
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [prompt, setPrompt] = useState('')
  const [tool, setTool] = useState<Tool>('pen')
  const [brushSize, setBrushSize] = useState(5)
  const [shapes, setShapes] = useState<Shape[]>([])
  const [cursor, setCursor] = useState<Point | null>(null)
  const [includeMarks, setIncludeMarks] = useState(true)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))
  const drawing = useRef(false)
  const stage = useRef<Konva.Stage>(null)
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeButton.current?.focus()
    return () => previousFocus?.focus()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      const el = event.target as HTMLElement | null
      if (el?.closest('input, textarea, [contenteditable="true"]')) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        setShapes(current => current.slice(0, -1))
      } else if (!event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'p') setTool('pen')
      else if (!event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'r') setTool('rect')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const intrinsicWidth = image?.naturalWidth || 700
  const intrinsicHeight = image?.naturalHeight || 490
  const availableWidth = Math.max(180, viewport.width - (viewport.width > 740 ? 430 : 55))
  const availableHeight = Math.max(160, Math.min(540, viewport.height * (viewport.width > 740 ? .59 : .39)))
  const scale = Math.min(1, 720 / intrinsicWidth, availableWidth / intrinsicWidth, availableHeight / intrinsicHeight)
  const width = Math.max(1, Math.round(intrinsicWidth * scale))
  const height = Math.max(1, Math.round(intrinsicHeight * scale))
  const displayScale = width / intrinsicWidth

  useEffect(() => {
    let alive = true
    let objectUrl: string | undefined
    getBlob(asset.id).then(blob => {
      if (!alive) return
      const src = blob ? (objectUrl = URL.createObjectURL(blob)) : asset.src
      if (!src) { setError(t('readImageFailed')); return }
      const loaded = new window.Image()
      loaded.crossOrigin = 'anonymous'
      loaded.onload = () => { if (alive) { setError(''); setImage(loaded) } }
      loaded.onerror = () => { if (alive) setError(t('readImageFailed')) }
      loaded.src = src
    }).catch(() => { if (alive) setError(t('readImageFailed')) })
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [asset.id, asset.src, t])

  const imagePoint = (): Point | null => {
    const p = stage.current?.getPointerPosition()
    if (!p || !image) return null
    return {
      x: Math.max(0, Math.min(intrinsicWidth, p.x / displayScale)),
      y: Math.max(0, Math.min(intrinsicHeight, p.y / displayScale)),
    }
  }
  const down = () => {
    if (exporting) return
    const p = imagePoint()
    if (!p) return
    setCursor(p)
    drawing.current = true
    setShapes(current => [...current, tool === 'pen'
      ? { kind: 'pen', points: [p.x, p.y, p.x + 0.01, p.y + 0.01], strokeWidth: brushSize / displayScale }
      : { kind: 'rect', x: p.x, y: p.y, width: 0, height: 0, strokeWidth: 3 / displayScale }])
  }
  const move = () => {
    const p = imagePoint()
    if (!p) return
    setCursor(p)
    if (!drawing.current) return
    setShapes(current => current.map((shape, index) => {
      if (index !== current.length - 1) return shape
      if (shape.kind === 'pen') return {...shape, points: [...shape.points, p.x, p.y]}
      return {...shape, width: p.x - shape.x, height: p.y - shape.y}
    }))
  }
  const stop = () => { drawing.current = false }

  const submit = async () => {
    if (!prompt.trim() || exporting) { if (!prompt.trim()) setError(t('promptRequired')); return }
    setError('')
    setExporting(true)
    try {
      let marked: Blob | undefined
      if (includeMarks && shapes.length) {
        // Drawings are only visual guidance, never a precise inpainting mask.
        // The stage is always rendered in the source-image coordinate space.
        const dataUrl = stage.current?.toDataURL({ pixelRatio: intrinsicWidth / width })
        if (!dataUrl) throw new Error('failed to export annotations')
        marked = await (await fetch(dataUrl)).blob()
      }
      onSubmit(prompt.trim(), marked)
    } catch {
      setError(t('exportFailed'))
      setExporting(false)
    }
  }

  return <div className="modal-backdrop editor-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !exporting) onClose() }}>
    <div className="editor-modal" role="dialog" aria-modal="true" aria-label={t('editorTitle')}>
      <div className="editor-head">
        <div className="editor-heading">
          {fromPreview && <button type="button" className="editor-back-button" onClick={onClose} title={t('backToPreview')} aria-label={t('backToPreview')}><ArrowLeft size={17}/></button>}
          <div><strong>{t('editorTitle')}</strong><span>{t('noMask')}</span></div>
        </div>
        <button ref={closeButton} className="icon-button" onClick={onClose} title={t('closePreview')} aria-label={t('closePreview')}><X size={20}/></button>
      </div>
      <div className="editor-layout">
        <div className="editor-stage-col">
          <div className="editor-toolbar" role="toolbar" aria-label={t('annotationTools')}>
            <button type="button" className={tool === 'pen' ? 'is-active' : ''} aria-pressed={tool === 'pen'} onClick={() => setTool('pen')}><PenLine size={17}/>{t('draw')}</button>
            <button type="button" className={tool === 'rect' ? 'is-active' : ''} aria-pressed={tool === 'rect'} onClick={() => setTool('rect')}><SquareDashed size={17}/>{t('rectangle')}</button>
            <span className="toolbar-divider"/>
            <button type="button" onClick={() => setShapes(current => current.slice(0, -1))} disabled={!shapes.length || exporting} title={t('undo')}><RotateCcw size={16}/>{t('undo')}</button>
            <button type="button" onClick={() => setShapes([])} disabled={!shapes.length || exporting} title={t('clearMarks')}><Trash2 size={16}/>{t('clearMarks')}</button>
            <span className="editor-mark-count" aria-live="polite"><Check size={13}/>{t('annotationCount', {count:shapes.length})}</span>
          </div>
          {tool === 'pen' && <div className="editor-brush-options">
            <label htmlFor="brush-width">{t('brushSize')}</label>
            <input id="brush-width" type="range" min={2} max={16} step={1} value={brushSize} onChange={event => setBrushSize(Number(event.target.value))}/>
            <span className="editor-brush-sample"><i style={{width:brushSize, height:brushSize}}/></span>
            <span>{brushSize}px</span>
          </div>}
          <div className="stage-wrap editor-stage-shell">
            {image ? <div className="editor-image-surface" style={{width, height}}>
              <Stage ref={stage} width={width} height={height} onPointerDown={down} onPointerMove={move} onPointerUp={stop} onPointerLeave={() => {stop(); setCursor(null)}} onPointerCancel={() => {stop(); setCursor(null)}}>
                <Layer scaleX={displayScale} scaleY={height / intrinsicHeight}>
                  <KonvaImage image={image} width={intrinsicWidth} height={intrinsicHeight}/>
                  {shapes.map((shape, index) => shape.kind === 'pen'
                    ? <Line key={index} points={shape.points} stroke="#ff5268" strokeWidth={shape.strokeWidth} lineCap="round" lineJoin="round" tension={.18} listening={false}/>
                    : <Rect key={index} x={shape.x} y={shape.y} width={shape.width} height={shape.height} stroke="#ff5268" fill="rgba(255,82,104,.13)" strokeWidth={shape.strokeWidth} dash={[9 / displayScale, 5 / displayScale]} listening={false}/>)}
                </Layer>
              </Stage>
              {cursor && !exporting && <div className={`editor-cursor ${tool === 'rect' ? 'is-rect' : ''}`} aria-hidden="true" style={{left:cursor.x * displayScale, top:cursor.y * height / intrinsicHeight, width:tool === 'rect' ? 12 : brushSize, height:tool === 'rect' ? 12 : brushSize}}/>}
            </div> : <div className="stage-loading" role="status">{error || <><LoaderCircle size={17} className="spin"/>{t('imageLoading')}</>}</div>}
          </div>
          <div className="editor-feedback" role="status" aria-live="polite"><Info size={15}/><span>{t(tool === 'pen' ? 'penFeedback' : 'rectFeedback')}</span></div>
          <p className="stage-note"><Info size={14}/>{t('markInfo')}</p>
        </div>
        <aside className="editor-side">
          <h3>{t('editInstruction')}</h3>
          <textarea rows={6} value={prompt} onChange={event => {setPrompt(event.target.value);if(error === t('promptRequired')) setError('')}} placeholder={t('editorPromptExample')} aria-label={t('editInstruction')}/>
          <div className="quick-title">{t('quickSuggestions')}</div>
          <div className="quick-grid">
            {(['keepUnchanged','watercolor','night','removeMarks'] as const).map(key => <button type="button" key={key} onClick={() => setPrompt(current => current ? `${current}, ${t(key)}` : t(key))}>{t(key)}</button>)}
          </div>
          <label className="checkbox-row"><input type="checkbox" checked={includeMarks} onChange={event => setIncludeMarks(event.target.checked)}/>{t('attachMarked')}</label>
          <div className="editor-warning">{t('wholeImageWarning')}</div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="button" className="primary-button editor-submit" onClick={() => void submit()} disabled={!image || exporting}>{exporting ? <LoaderCircle size={17} className="spin"/> : <Send size={17}/>} {exporting ? t('preparingEdit') : t('submitEdit')}</button>
        </aside>
      </div>
    </div>
  </div>
}
