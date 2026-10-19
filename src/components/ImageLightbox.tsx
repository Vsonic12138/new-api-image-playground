import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Download, Pencil, Sparkles, X } from 'lucide-react'
import type { AssetRef } from '../types'
import { ImageView } from './ImageView'
import { toIntlLocale } from '../i18n/resources'

type Props = {
  image: AssetRef
  images: AssetRef[]
  imageModel: string
  onClose: () => void
  onSelect: (image: AssetRef) => void
  onEdit: (image: AssetRef) => void
  onDownload: (image: AssetRef) => void
}

export function ImageLightbox({ image, images, imageModel, onClose, onSelect, onEdit, onDownload }: Props) {
  const { t, i18n } = useTranslation('imagePlayground')
  const closeButton = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const currentIndex = images.findIndex(item => item.id === image.id)
  const safeIndex = Math.max(0, currentIndex)
  const hasMultiple = images.length > 1
  const changeImage = (direction: number) => {
    if (!hasMultiple) return
    onSelect(images[(safeIndex + direction + images.length) % images.length])
  }

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeButton.current?.focus()
    return () => previouslyFocused?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]')
        if (focusable?.length) {
          const first = focusable[0]
          const last = focusable[focusable.length - 1]
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
        }
      }
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
      if (event.key === 'ArrowLeft' && hasMultiple) {
        event.preventDefault()
        changeImage(-1)
      }
      if (event.key === 'ArrowRight' && hasMultiple) {
        event.preventDefault()
        changeImage(1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  return <div className="preview-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={dialogRef} className="preview-dialog" role="dialog" aria-modal="true" aria-label={t('imageDetail')}>
      <header className="preview-header">
        <div className="preview-heading"><Sparkles size={18}/><strong>{t('imageDetail')}</strong><span>{t('imagePosition', { index: safeIndex + 1, total: images.length })}</span></div>
        <button ref={closeButton} type="button" className="preview-icon-button" onClick={onClose} aria-label={t('closePreview')} title={t('closePreview')}><X size={20}/></button>
      </header>
      <div className="preview-body">
        <div className="preview-stage">
          {hasMultiple && <button type="button" className="preview-nav preview-nav-left" onClick={() => changeImage(-1)} aria-label={t('previousImage')} title={t('previousImage')}><ChevronLeft size={22}/></button>}
          <ImageView asset={image} className="preview-hero" alt={t('currentImage')}/>
          {hasMultiple && <button type="button" className="preview-nav preview-nav-right" onClick={() => changeImage(1)} aria-label={t('nextImage')} title={t('nextImage')}><ChevronRight size={22}/></button>}
        </div>
        <aside className="preview-details">
          <div>
            <h2>{t('currentImage')}</h2>
            <p className="preview-subtitle">{t(image.parentId ? 'byEditing' : 'byGeneration')}</p>
          </div>
          <div className="preview-meta">
            <div><span>{t('imageModel')}</span><strong>{imageModel}</strong></div>
            <div><span>{t('createdTime')}</span><strong>{new Date(image.createdAt).toLocaleString(toIntlLocale(i18n.resolvedLanguage || i18n.language))}</strong></div>
          </div>
          <div className="preview-actions">
            <button type="button" className="primary-button" onClick={() => onEdit(image)}><Pencil size={17}/>{t('continueEdit')}</button>
            <button type="button" className="preview-download" onClick={() => onDownload(image)}><Download size={17}/>{t('download')}</button>
          </div>
        </aside>
      </div>
      {images.length > 1 && <footer className="preview-footer"><span>{t('imageHistory')}</span><div className="preview-thumbnails">
        {images.map((item, index) => <ImageView key={item.id} asset={item} className={item.id === image.id ? 'preview-thumb selected' : 'preview-thumb'} onClick={() => onSelect(item)} alt={t('imagePosition', {index: index + 1, total: images.length})}/>)}
      </div></footer>}
    </div>
  </div>
}
