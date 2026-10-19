import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, PenLine, SquareDashed, RotateCcw, Trash2, Send, Info } from 'lucide-react'
import { Stage, Layer, Image as KonvaImage, Line, Rect } from 'react-konva'
import type Konva from 'konva'
import type { AssetRef } from '../types'
import { getBlob } from '../lib/image-store'

type Shape = { kind: 'pen'; points: number[] } | { kind: 'rect'; x: number; y: number; width: number; height: number }
type Props = { asset: AssetRef; onClose: () => void; onSubmit: (prompt: string, annotatedImage?: Blob) => void }

export function EditorModal({ asset, onClose, onSubmit }: Props) {
  const {t} = useTranslation('imagePlayground')
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [prompt, setPrompt] = useState('')
  const [tool, setTool] = useState<'pen' | 'rect'>('pen')
  const [shapes, setShapes] = useState<Shape[]>([])
  const [includeMarks, setIncludeMarks] = useState(true)
  const [error, setError] = useState('')
  const drawing = useRef(false)
  const stage = useRef<Konva.Stage>(null)
  const availableWidth = Math.max(180, window.innerWidth - (window.innerWidth > 740 ? 430 : 65))
  const availableHeight = Math.max(180, Math.min(520, window.innerHeight * (window.innerWidth > 740 ? 0.62 : 0.42)))
  const intrinsicWidth = image?.naturalWidth || 700
  const intrinsicHeight = image?.naturalHeight || 490
  const scale = Math.min(1, 690 / intrinsicWidth, availableWidth / intrinsicWidth, availableHeight / intrinsicHeight)
  const width = Math.max(1, Math.round(intrinsicWidth * scale))
  const height = Math.max(1, Math.round(intrinsicHeight * scale))
  useEffect(() => {
    let alive = true
    let objectUrl: string | undefined
    getBlob(asset.id).then(blob => {
      if (!alive) return
      const src = blob ? (objectUrl = URL.createObjectURL(blob)) : asset.src
      if (!src) { setError(t('readImageFailed')); return }
      const htmlImage = new window.Image()
      htmlImage.crossOrigin = 'anonymous'
      htmlImage.onload = () => { if (alive) setImage(htmlImage) }
      htmlImage.onerror = () => { if (alive) setError(t('readImageFailed')) }
      htmlImage.src = src
    }).catch(() => { if (alive) setError(t('readImageFailed')) })
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [asset.id, asset.src])
  const point = () => stage.current?.getPointerPosition()
  const down = () => {
    const p = point()
    if (!p) return
    drawing.current = true
    if (tool === 'pen') setShapes(s => [...s, { kind: 'pen', points: [p.x, p.y] }])
    else setShapes(s => [...s, { kind: 'rect', x: p.x, y: p.y, width: 0, height: 0 }])
  }
  const move = () => {
    if (!drawing.current) return
    const p = point()
    if (!p) return
    setShapes(s => s.map((shape, i) => {
      if (i !== s.length - 1) return shape
      if (shape.kind === 'pen') return { ...shape, points: [...shape.points, p.x, p.y] }
      return { ...shape, width: p.x - shape.x, height: p.y - shape.y }
    }))
  }
  const submit = async () => {
    if (!prompt.trim()) { setError(t('promptRequired')); return }
    setError('')
    try {
      let marked: Blob | undefined
      if (includeMarks && shapes.length) {
        // This is a visibly annotated full-size image, NOT an inpainting mask.
        // Sending it may cause marks to appear in the output; upstream behavior varies.
        const dataUrl = stage.current?.toDataURL({ pixelRatio: (image?.naturalWidth || width) / width })
        if (dataUrl) marked = await (await fetch(dataUrl)).blob()
      }
      onSubmit(prompt.trim(), marked)
    } catch {
      setError(t('exportFailed'))
    }
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
    <div className="editor-modal" role="dialog" aria-modal="true" aria-label={t('editorTitle')}>
      <div className="editor-head"><div><strong>{t('editorTitle')}</strong><span>{t('noMask')}</span></div><button className="icon-button" onClick={onClose} title="Close"><X size={20}/></button></div>
      <div className="editor-layout">
        <div className="editor-stage-col"><div className="editor-toolbar">
          <button className={tool === 'pen' ? 'is-active' : ''} onClick={() => setTool('pen')}><PenLine size={17}/>{t('draw')}</button>
          <button className={tool === 'rect' ? 'is-active' : ''} onClick={() => setTool('rect')}><SquareDashed size={17}/>{t('rectangle')}</button>
          <span className="toolbar-divider"/>
          <button onClick={() => setShapes(s => s.slice(0, -1))} disabled={!shapes.length}><RotateCcw size={16}/>{t('undo')}</button>
          <button onClick={() => setShapes([])} disabled={!shapes.length}><Trash2 size={16}/>{t('clearMarks')}</button>
        </div>
        <div className="stage-wrap" style={{ minHeight: height }}>{image ? <Stage ref={stage} width={width} height={height} onMouseDown={down} onMouseMove={move} onMouseUp={() => drawing.current = false} onTouchStart={down} onTouchMove={move} onTouchEnd={() => drawing.current = false}>
          <Layer><KonvaImage image={image} width={width} height={height}/>
          {shapes.map((shape, i) => shape.kind === 'pen'
            ? <Line key={i} points={shape.points} stroke="#ff4d63" strokeWidth={4} lineCap="round" lineJoin="round" tension={0.25}/>
            : <Rect key={i} x={shape.x} y={shape.y} width={shape.width} height={shape.height} stroke="#ff4d63" strokeWidth={3} dash={[9,5]}/>)}
          </Layer></Stage> : <div className="stage-loading">{error || t('imageLoading')}</div>}</div>
        <p className="stage-note"><Info size={14}/> {t('markInfo')}</p></div>
        <aside className="editor-side"><h3>{t('editInstruction')}</h3><textarea rows={6} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder={t('editorPromptExample')}/>
          <div className="quick-title">{t('quickSuggestions')}</div><div className="quick-grid">
          {(['keepUnchanged','watercolor','night','removeMarks'] as const).map(key => <button key={key} onClick={() => setPrompt(v => v ? `${v}, ${t(key)}` : t(key))}>{t(key)}</button>)}
          </div>
          <label className="checkbox-row"><input type="checkbox" checked={includeMarks} onChange={e => setIncludeMarks(e.target.checked)}/> {t('attachMarked')}</label>
          <div className="editor-warning">{t('wholeImageWarning')}</div>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button editor-submit" onClick={submit} disabled={!image}><Send size={17}/>{t('submitEdit')}</button>
        </aside>
      </div>
    </div>
  </div>
}
