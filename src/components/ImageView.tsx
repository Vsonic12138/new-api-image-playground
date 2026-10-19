import { useEffect, useState } from 'react'
import type { AssetRef } from '../types'
import { getBlob } from '../lib/image-store'

export function ImageView({ asset, className, onClick, alt = 'AI 图片' }: {
  asset: AssetRef; className?: string; onClick?: () => void; alt?: string
}) {
  const [url, setUrl] = useState<string | undefined>(asset.src)
  useEffect(() => {
    let active = true
    let objectUrl: string | undefined
    setUrl(asset.src)
    getBlob(asset.id).then(blob => {
      if (!active || !blob) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    }).catch(() => {})
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [asset.id, asset.src])
  return <div className={`image-frame ${className || ''}`} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={(e) => { if (onClick && (e.key === 'Enter' || e.key === ' ')) onClick() }}>
    {url ? <img src={url} alt={alt} loading="lazy" /> : <div className="image-loading">图片加载中…</div>}
  </div>
}
