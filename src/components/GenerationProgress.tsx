import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Clock3, Image as ImageIcon, Sparkles } from 'lucide-react'
import type { WorkMode, ImageProgressPhase } from '../types'

type Props = { mode: WorkMode; phase?: ImageProgressPhase; startedAt: number }

/** Honest, indeterminate progress: our upstream does not expose a completion %. */
export function GenerationProgress({ mode, phase = 'preparing', startedAt }: Props) {
  const { t } = useTranslation('imagePlayground')
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
  useEffect(() => {
    const update = () => setSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [startedAt])

  const activeStep = phase === 'saving' ? 2 : phase === 'requesting' ? 1 : 0
  const steps = [
    { label: t('progressPreparing'), value: 0 },
    { label: mode === 'edit' ? t('progressEditing') : t('progressGenerating'), value: 1 },
    { label: t('progressSavingLocal'), value: 2 },
  ]
  const elapsed = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
  const status = steps[activeStep]?.label || steps[0].label

  return <div className="generation-progress" role="status" aria-label={status} aria-live="polite">
    <div className="generation-progress-heading">
      <div className="generation-progress-icon" aria-hidden="true">{mode === 'edit' ? <ImageIcon size={20}/> : <Sparkles size={20}/>}</div>
      <div className="generation-progress-heading-text">
        <strong>{mode === 'edit' ? t('editing') : t('generating')}</strong>
        <span>{t('progressEstimateDisclaimer')}</span>
      </div>
      <span className="generation-elapsed" aria-label={t('progressElapsed', { time: elapsed })}><Clock3 size={13}/>{elapsed}</span>
    </div>
    <div className="generation-skeleton" aria-hidden="true">
      <span/><span/><span/>
      <div className="generation-skeleton-shimmer"/>
    </div>
    <div className="generation-steps">
      {steps.map((step) => <div className={`generation-step ${step.value === activeStep ? 'active' : step.value < activeStep ? 'complete' : ''}`} key={step.value}>
        <span className="generation-step-dot" aria-hidden="true">{step.value < activeStep ? <Check size={11}/> : null}</span>
        <span>{step.label}</span>
      </div>)}
    </div>
    <p className="generation-progress-footnote">{t('progressNoPercentage')}</p>
  </div>
}
