'use client'

import { Check } from 'lucide-react'
import { StoreLabel } from '@/components/customer/storefront-labels-provider'
import { STATUS_STEPS } from './status-steps'

interface StatusTimelineProps {
  currentIndex: number
}

/** The five stages as a vertical checklist, painted in the owner's timeline colours. */
export function StatusTimeline({ currentIndex }: StatusTimelineProps) {
  return (
    <section
      aria-label="Order progress"
      data-branding-scope="tracking/timeline"
      className="border p-5 shadow-sm"
      style={{ borderRadius: 'var(--trk-radius)', backgroundColor: 'var(--trk-card)', borderColor: 'var(--trk-card-border)' }}
    >
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--trk-text-muted)' }}>
        <StoreLabel name="tracking.progress_title" fallback="Progress" />
      </h2>
      <ol className="relative">
        {STATUS_STEPS.map((step, index) => {
          const isCompleted = index < currentIndex
          const isCurrent = index === currentIndex
          const isPending = index > currentIndex
          const isLast = index === STATUS_STEPS.length - 1
          const Icon = step.icon

          const bubbleStyle = isCompleted
            ? { backgroundColor: 'var(--trk-step-done)', borderColor: 'var(--trk-step-done)', color: 'var(--trk-on-step-done)' }
            : isCurrent
              ? { backgroundColor: 'var(--trk-step-current)', borderColor: 'var(--trk-step-current)', color: 'var(--trk-on-step-current)', boxShadow: '0 0 0 6px var(--trk-step-current-soft)' }
              : { backgroundColor: 'transparent', borderColor: 'var(--trk-step-upcoming)', color: 'var(--trk-text-faint)' }

          return (
            <li key={step.key} className="flex gap-4" aria-current={isCurrent ? 'step' : undefined}>
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-500 ${
                    isCurrent ? 'animate-pulse motion-reduce:animate-none' : ''
                  }`}
                  style={bubbleStyle}
                >
                  {isCompleted ? <Check className="h-5 w-5" strokeWidth={3} aria-hidden="true" /> : <Icon className="h-5 w-5" aria-hidden="true" />}
                </div>
                {!isLast && (
                  <div
                    className="w-0.5 flex-1 min-h-8 transition-colors duration-500"
                    style={{ backgroundColor: isCompleted ? 'var(--trk-step-done)' : 'var(--trk-step-upcoming)' }}
                  />
                )}
              </div>
              <div className={`pb-6 pt-2 ${isPending ? 'opacity-50' : ''}`}>
                <p
                  className="text-sm font-semibold"
                  style={{ color: isCurrent ? 'var(--trk-step-current)' : isCompleted ? 'var(--trk-step-done)' : 'var(--trk-text-muted)' }}
                >
                  <StoreLabel name={step.titleLabel} fallback={step.label} />
                </p>
                <p className="mt-0.5 text-xs" style={{ color: 'var(--trk-text-muted)' }}>
                  <StoreLabel name={step.descriptionLabel} fallback={step.description} />
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
