import { useEffect, useRef, useState } from 'react'
import { X, PenLine, SquareDashed, RotateCcw, Trash2, Send, Info } from 'lucide-react'
import { Stage, Layer, Image as KonvaImage, Line, Rect } from 'react-konva'
import type Konva from 'konva'
import type { AssetRef } from '../types'
import { getBlob } from '../lib/image-store'

type Shape = { kind: 'pen'; points: number[] } | { kind: 'rect'; x: number; y: number; width: number; height: number }
type Props = { asset: AssetRef; onClose: () => void; onSubmit: (prompt: string, annotatedImage?: Blob) => void }

export function EditorModal({ asset, onClose, onSubmit }: Props) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [prompt, setPrompt] = useState('')
  const [tool, setTool] = useState<'pen' | 'rect'>('pen')
  const [shapes, setShapes] = useState<Shape[]>([])
  const [includeMarks, setIncludeMarks] = useState(true)
  const [error, setError] = useState('')
  const drawing = useRef(false)
  const stage = useRef<Konva.Stage>(null)
  const width = Math.min(690, Math.max(320, window.innerWidth - 90))
  const ratio = image ? image.naturalHeight / image.naturalWidth : 0.7
  const height = Math.min(480, Math.round(width * ratio))
  useEffect(() => {
    let alive = true
    let objectUrl: string | undefined
    getBlob(asset.id).then(blob => {
      if (!alive) return
      const src = blob ? (objectUrl = URL.createObjectURL(blob)) : asset.src
      if (!src) { setError('图片不存在或已经被清理'); return }
      const htmlImage = new window.Image()
      htmlImage.crossOrigin = 'anonymous'
      htmlImage.onload = () => { if (alive) setImage(htmlImage) }
      htmlImage.onerror = () => { if (alive) setError('无法读取原图，请尝试重新生成或上传图片') }
      htmlImage.src = src
    }).catch(() => { if (alive) setError('图片读取失败') })
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
    if (!prompt.trim()) { setError('请输入图片修改要求'); return }
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
      setError('标注图导出失败（可能是上游图片限制跨域访问），请取消“附上标记”后重试')
    }
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
    <div className="editor-modal" role="dialog" aria-modal="true" aria-label="编辑图片">
      <div className="editor-head"><div><strong>编辑图片</strong><span>圈选只是视觉标注，暂不生成 Mask</span></div><button className="icon-button" onClick={onClose} title="关闭"><X size={20}/></button></div>
      <div className="editor-layout">
        <div className="editor-stage-col"><div className="editor-toolbar">
          <button className={tool === 'pen' ? 'is-active' : ''} onClick={() => setTool('pen')}><PenLine size={17}/>画圈/画笔</button>
          <button className={tool === 'rect' ? 'is-active' : ''} onClick={() => setTool('rect')}><SquareDashed size={17}/>框选</button>
          <span className="toolbar-divider"/>
          <button onClick={() => setShapes(s => s.slice(0, -1))} disabled={!shapes.length}><RotateCcw size={16}/>撤销</button>
          <button onClick={() => setShapes([])} disabled={!shapes.length}><Trash2 size={16}/>清除</button>
        </div>
        <div className="stage-wrap" style={{ minHeight: height }}>{image ? <Stage ref={stage} width={width} height={height} onMouseDown={down} onMouseMove={move} onMouseUp={() => drawing.current = false} onTouchStart={down} onTouchMove={move} onTouchEnd={() => drawing.current = false}>
          <Layer><KonvaImage image={image} width={width} height={height}/>
          {shapes.map((shape, i) => shape.kind === 'pen'
            ? <Line key={i} points={shape.points} stroke="#ff4d63" strokeWidth={4} lineCap="round" lineJoin="round" tension={0.25}/>
            : <Rect key={i} x={shape.x} y={shape.y} width={shape.width} height={shape.height} stroke="#ff4d63" strokeWidth={3} dash={[9,5]}/>)}
          </Layer></Stage> : <div className="stage-loading">{error || '正在加载图片…'}</div>}</div>
        <p className="stage-note"><Info size={14}/> 标注可帮助表达修改位置，但没有 Mask 时模型不一定精确遵循选区。</p></div>
        <aside className="editor-side"><h3>修改指令</h3><textarea rows={6} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="例如：把我画圈的区域换成竹蜻蜓，保持其余画面不变，并去除红色标记。"/>
          <div className="quick-title">快捷提示</div><div className="quick-grid">
          {['保持其他部分不变', '改成水彩风格', '换成夜景', '去掉画面中的标记'].map(t => <button key={t} onClick={() => setPrompt(v => v ? `${v}，${t}` : t)}>{t}</button>)}
          </div>
          <label className="checkbox-row"><input type="checkbox" checked={includeMarks} onChange={e => setIncludeMarks(e.target.checked)}/> 附上已圈选标记的图片</label>
          <div className="editor-warning">当前版本采用整图编辑。启用标记时，会把标注直接合成到参考图片上发送给模型（不是 Mask），可能影响生成结果。</div>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button editor-submit" onClick={submit} disabled={!image}><Send size={17}/>提交编辑</button>
        </aside>
      </div>
    </div>
  </div>
}
