'use client'

import { Check } from 'lucide-react'
import { StoreLabel } from '@/components/customer/storefront-labels-provider'
import { STATUS_STEPS } from './status-steps'
import { stepBubbleStyle, stepTitleColor } from './step-styles'

interface StatusStepsRowProps {
  currentIndex: number
  /** What the current step means, under the row. */
  showDetails: boolean
}

/** The five stages side by side (Page Designer "Steps" timeline), with the current step explained underneath. */
export function StatusStepsRow({ currentIndex, showDetails }: StatusStepsRowProps) {
  const current = STATUS_STEPS[currentIndex]
  return (
    <>
      <ol className="flex items-start">
        {STATUS_STEPS.map((step, index) => {
          const isCompleted = index < currentIndex
          const isCurrent = index === currentIndex
          const Icon = step.icon
          return (
            <li key={step.key} className="relative flex min-w-0 flex-1 flex-col items-center text-center" aria-current={isCurrent ? 'step' : undefined}>
              {index > 0 && (
                <span
                  className="absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2 transition-colors duration-500"
                  style={{ backgroundColor: index <= currentIndex ? 'var(--trk-step-done)' : 'var(--trk-step-upcoming)' }}
                  aria-hidden="true"
                />
              )}
              <div
                data-part="step"
                data-on={isCurrent ? '' : undefined}
                data-done={isCompleted ? '' : undefined}
                className="relative flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all duration-500"
                style={stepBubbleStyle(isCompleted, isCurrent)}
              >
                {isCompleted ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" /> : <Icon className="h-4 w-4" aria-hidden="true" />}
              </div>
              <p className={`mt-2 px-0.5 text-[11px] font-semibold leading-tight ${index > currentIndex ? 'opacity-50' : ''}`} style={{ color: stepTitleColor(isCompleted, isCurrent) }}>
                <StoreLabel name={step.titleLabel} fallback={step.label} />
              </p>
            </li>
          )
        })}
      </ol>
      {showDetails && current && (
        <p data-part="muted" className="mt-4 text-center text-xs" style={{ color: 'var(--trk-text-muted)' }}>
          <StoreLabel name={current.descriptionLabel} fallback={current.description} />
        </p>
      )}
    </>
  )
}
