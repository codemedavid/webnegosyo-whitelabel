'use client'

import { Check } from 'lucide-react'
import { StoreLabel } from '@/components/customer/storefront-labels-provider'
import { STATUS_STEPS } from './status-steps'
import { StatusStepsRow } from './status-steps-row'
import { stepBubbleStyle, stepTitleColor } from './step-styles'

export type StatusTimelineLayout = 'list' | 'steps' | 'compact'

interface StatusTimelineProps {
  currentIndex: number
  /** Page Designer wording for the title; unset = the store's label. */
  title?: string
  /** Page Designer layout; unset = today's vertical checklist. */
  layout?: StatusTimelineLayout
  showTitle?: boolean
  /** What each step means (the compact list never shows it). */
  showDetails?: boolean
}

const SIZES = {
  list: { bubble: 'h-10 w-10', icon: 'h-5 w-5', line: 'min-h-8', text: 'pb-6 pt-2' },
  compact: { bubble: 'h-8 w-8', icon: 'h-4 w-4', line: 'min-h-4', text: 'pb-3 pt-1.5' },
} as const

/** The five stages as a vertical checklist, painted in the owner's timeline colours. */
export function StatusTimeline({ currentIndex, title, layout = 'list', showTitle = true, showDetails = true }: StatusTimelineProps) {
  return (
    <section
      aria-label="Order progress"
      data-branding-scope="tracking/timeline"
      data-part="card"
      className="border p-5 shadow-sm"
      style={{ borderRadius: 'var(--trk-radius)', backgroundColor: 'var(--trk-card)', borderColor: 'var(--trk-card-border)' }}
    >
      {showTitle && (
        <h2 data-part="title" className="mb-4 text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--trk-text-muted)' }}>
          {title ?? <StoreLabel name="tracking.progress_title" fallback="Progress" />}
        </h2>
      )}
      {layout === 'steps' ? (
        <StatusStepsRow currentIndex={currentIndex} showDetails={showDetails} />
      ) : (
        <StepList currentIndex={currentIndex} size={SIZES[layout]} showDetails={layout === 'list' && showDetails} />
      )}
    </section>
  )
}

function StepList({ currentIndex, size, showDetails }: { currentIndex: number; size: (typeof SIZES)[keyof typeof SIZES]; showDetails: boolean }) {
  return (
    <ol className="relative">
      {STATUS_STEPS.map((step, index) => {
        const isCompleted = index < currentIndex
        const isCurrent = index === currentIndex
        const isPending = index > currentIndex
        const isLast = index === STATUS_STEPS.length - 1
        const Icon = step.icon

        return (
          <li key={step.key} className="flex gap-4" aria-current={isCurrent ? 'step' : undefined}>
            <div className="flex flex-col items-center">
              <div
                data-part="step"
                data-on={isCurrent ? '' : undefined}
                data-done={isCompleted ? '' : undefined}
                className={`flex ${size.bubble} items-center justify-center rounded-full border-2 transition-all duration-500 ${
                  isCurrent ? 'animate-pulse motion-reduce:animate-none' : ''
                }`}
                style={stepBubbleStyle(isCompleted, isCurrent)}
              >
                {isCompleted ? <Check className={size.icon} strokeWidth={3} aria-hidden="true" /> : <Icon className={size.icon} aria-hidden="true" />}
              </div>
              {!isLast && (
                <div
                  className={`w-0.5 flex-1 ${size.line} transition-colors duration-500`}
                  style={{ backgroundColor: isCompleted ? 'var(--trk-step-done)' : 'var(--trk-step-upcoming)' }}
                />
              )}
            </div>
            <div className={`${size.text} ${isPending ? 'opacity-50' : ''}`}>
              <p className="text-sm font-semibold" style={{ color: stepTitleColor(isCompleted, isCurrent) }}>
                <StoreLabel name={step.titleLabel} fallback={step.label} />
              </p>
              {showDetails && (
                <p data-part="muted" className="mt-0.5 text-xs" style={{ color: 'var(--trk-text-muted)' }}>
                  <StoreLabel name={step.descriptionLabel} fallback={step.description} />
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
