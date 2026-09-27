'use client'

import { ArrowLeft } from 'lucide-react'
import { resolveSeniorOrderSteps, type SeniorOrderStep, type SeniorOrderStepId } from '@/lib/senior-mode'
import type { BrandingColors } from '@/lib/branding-utils'
import { useSeniorMode } from './senior-mode-provider'

interface SeniorOrderStepsProps {
  current: SeniorOrderStepId
  branding: BrandingColors
  /** Omit both to hide the back button (e.g. once the order is sent). */
  backLabel?: string
  onBack?: () => void
}

const STATUS_WORDS: Record<SeniorOrderStep['status'], string> = {
  done: 'done',
  current: 'you are here',
  upcoming: 'not yet',
}

/**
 * "Step 2 of 4 — Check cart" — senior mode only.
 *
 * Replaces the cart/checkout design's own header (hidden via
 * `data-senior-hidden`) so there is exactly one back button, and it says where
 * it goes. The back bar is sticky so it stays reachable on a long cart; the
 * progress block below is compact so the cart itself starts high on the screen.
 */
export function SeniorOrderSteps({ current, branding, backLabel, onBack }: SeniorOrderStepsProps) {
  const isSeniorMode = useSeniorMode()
  if (!isSeniorMode) return null

  const steps = resolveSeniorOrderSteps(current)
  const currentIndex = steps.findIndex((step) => step.status === 'current')
  const currentStep = steps[currentIndex]
  const nextStep = steps[currentIndex + 1]

  return (
    <>
      {backLabel && onBack && (
        <div
          className="sticky top-0 z-50 border-b"
          style={{ backgroundColor: branding.background, borderColor: branding.border }}
        >
          <div className="mx-auto max-w-2xl px-4 py-2">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-12 items-center gap-2 rounded-full border-2 px-4 text-base font-bold transition-transform active:scale-[0.98]"
              style={{ borderColor: branding.textPrimary, color: branding.textPrimary }}
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              {backLabel}
            </button>
          </div>
        </div>
      )}

      {currentStep && (
        <nav aria-label="Order progress" className="mx-auto max-w-2xl px-4 pt-4 pb-1">
          <p className="text-sm font-semibold" style={{ color: branding.textSecondary }}>
            Step {currentStep.number} of {steps.length}
          </p>
          <h2 className="text-2xl font-bold leading-tight" style={{ color: branding.textPrimary }}>
            {currentStep.label}
          </h2>

          <ol className="mt-3 grid grid-cols-4 gap-1.5">
            {steps.map((step) => (
              <li
                key={step.id}
                aria-current={step.status === 'current' ? 'step' : undefined}
                className="h-2.5 rounded-full"
                style={{ backgroundColor: step.status === 'upcoming' ? branding.border : branding.buttonPrimary }}
              >
                <span className="sr-only">{`${step.label} (${STATUS_WORDS[step.status]})`}</span>
              </li>
            ))}
          </ol>

          {nextStep && (
            <p className="mt-2 text-base" style={{ color: branding.textSecondary }}>
              Next: <span className="font-semibold">{nextStep.label}</span>
            </p>
          )}
        </nav>
      )}
    </>
  )
}
