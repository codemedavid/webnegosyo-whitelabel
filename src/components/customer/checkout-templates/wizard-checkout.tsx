'use client'

/**
 * Wizard checkout design — a focused, step-by-step flow inspired by
 * Shop Pay / Stripe Checkout. One section at a time inside a centered white
 * card, with a branded numbered progress stepper. Pure presentation: all logic
 * comes from useCheckout() and the branding-aware primitives. The confirmation
 * screen and payment/QR dialogs are rendered by the page shell (shared).
 */

import { useState } from 'react'
import { ArrowLeft, Check, ChevronLeft } from 'lucide-react'
import { getContrastColor, setAlpha } from '@/lib/branding-utils'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import {
  OrderTypeSelector,
  AdvanceOrderScheduler,
  CheckoutFields,
  OrderSummaryLines,
  PaymentMethodList,
  CheckoutCTA,
} from './checkout-primitives'

const STEPS = ['Receive', 'Details', 'Payment', 'Review'] as const

export function WizardCheckout({ checkout }: { checkout: UseCheckoutReturn }) {
  const {
    router, tenant, branding, orderTypes, orderType, formFields,
    advanceConfig, selectedOrderTypeData,
    customerData, paymentMethods, selectedPaymentMethod,
    scheduleMode, scheduledForLabel, isScheduleValid,
  } = checkout

  const [step, setStep] = useState(0)

  if (!tenant) return null

  const accent = branding.buttonPrimary || branding.primary || '#111111'
  const accentText = getContrastColor(accent)
  const accentSoft = setAlpha(accent, 0.08)

  const isFirstStep = step === 0
  const isLastStep = step === STEPS.length - 1

  const goBack = () => setStep((s) => Math.max(0, s - 1))
  const goNext = () => setStep((s) => Math.min(STEPS.length - 1, s + 1))

  // Per-step validation. The final CTA (handleProceedToPayment) lives on the
  // Review step; if the user could reach it with invalid earlier-step state, its
  // error toast would point at inputs on a now-hidden step. Gating "Continue"
  // keeps the offending control visible. Mirrors handleProceedToPayment's checks.
  const requiredMissing = formFields.filter(
    (f) => f.is_required && !(customerData[f.field_name] || '').trim(),
  )
  const receiveValid =
    !advanceConfig.enabled ||
    (advanceConfig.allowAsap && scheduleMode === 'asap') ||
    (scheduleMode === 'scheduled' && !!scheduledForLabel && isScheduleValid)
  const detailsValid = !(orderType && formFields.length > 0) || requiredMissing.length === 0
  const paymentValid = !!tenant.qr_handoff_enabled || paymentMethods.length === 0 || !!selectedPaymentMethod
  const stepValid = step === 0 ? receiveValid : step === 1 ? detailsValid : step === 2 ? paymentValid : true
  const continueHint =
    step === 0 && !receiveValid ? 'Please choose a date & time for your order'
    : step === 1 && !detailsValid ? `Please fill in: ${requiredMissing.map((f) => f.field_label).join(', ')}`
    : step === 2 && !paymentValid ? 'Please select a payment method to continue'
    : null

  const stepTitles = [
    'How would you like to receive your order?',
    'Your information',
    'How would you like to pay?',
    'Review your order',
  ]
  const stepSubtitles = [
    'Choose a fulfillment method' + (advanceConfig.enabled ? ' and when you want it.' : '.'),
    'Tell us how to reach you.',
    'Select a payment method to continue.',
    'Make sure everything looks right before you place your order.',
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-2xl items-center gap-3 px-4">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Go back"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold text-gray-900">Checkout</h1>
            <p className="truncate text-xs text-gray-500">{tenant.name}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
        {/* Progress stepper */}
        <nav aria-label="Checkout progress" className="mb-6 sm:mb-8">
          <ol className="flex items-center">
            {STEPS.map((label, index) => {
              const isComplete = index < step
              const isActive = index === step
              const isDone = isComplete || isActive
              return (
                <li
                  key={label}
                  className={`flex items-center ${index < STEPS.length - 1 ? 'flex-1' : ''}`}
                >
                  <div className="flex flex-col items-center gap-1.5">
                    <span
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-colors"
                      style={
                        isDone
                          ? { backgroundColor: accent, color: accentText }
                          : { backgroundColor: '#f3f4f6', color: '#9ca3af' }
                      }
                      aria-current={isActive ? 'step' : undefined}
                    >
                      {isComplete ? <Check className="h-4 w-4" /> : index + 1}
                    </span>
                    <span
                      className={`hidden text-[11px] font-medium sm:block ${
                        isDone ? 'text-gray-900' : 'text-gray-400'
                      }`}
                    >
                      {label}
                    </span>
                  </div>
                  {index < STEPS.length - 1 && (
                    <span className="relative mx-2 h-0.5 flex-1 rounded-full bg-gray-200">
                      <span
                        className="absolute inset-y-0 left-0 rounded-full transition-all"
                        style={{
                          width: index < step ? '100%' : '0%',
                          backgroundColor: accent,
                        }}
                      />
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
        </nav>

        {/* Step card */}
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100 sm:p-7">
          <div className="mb-5 sm:mb-6">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>
              Step {step + 1} of {STEPS.length}
            </p>
            <h2 className="mt-1 text-xl font-bold text-gray-900 sm:text-2xl">{stepTitles[step]}</h2>
            <p className="mt-1 text-sm text-gray-500">{stepSubtitles[step]}</p>
          </div>

          {/*
            All steps stay mounted (hidden when inactive) so the hook's
            scroll-to-error can always reach the AdvanceOrderScheduler
            (data-advance-order) and PaymentMethodList (data-payment-methods)
            anchors, matching the classic conditional-rendering rules.
          */}

          {/* Step 0 — Receive */}
          <div className={STEPS[step] === 'Receive' ? 'space-y-6' : 'hidden'} aria-hidden={STEPS[step] !== 'Receive'}>
            {orderTypes.length > 0 && (
              <>
                <OrderTypeSelector checkout={checkout} />
                {advanceConfig.enabled && <AdvanceOrderScheduler checkout={checkout} />}
              </>
            )}
          </div>

          {/* Step 1 — Details */}
          <div className={STEPS[step] === 'Details' ? '' : 'hidden'} aria-hidden={STEPS[step] !== 'Details'}>
            {orderType && formFields.length > 0 ? (
              <CheckoutFields checkout={checkout} columns={1} />
            ) : (
              <p className="text-sm text-gray-500">No additional information is needed for this order.</p>
            )}
          </div>

          {/* Step 2 — Payment */}
          <div className={STEPS[step] === 'Payment' ? '' : 'hidden'} aria-hidden={STEPS[step] !== 'Payment'}>
            <PaymentMethodList checkout={checkout} />
          </div>

          {/* Step 3 — Review */}
          <div className={STEPS[step] === 'Review' ? 'space-y-5' : 'hidden'} aria-hidden={STEPS[step] !== 'Review'}>
            {selectedOrderTypeData?.name && (
              <div
                className="flex items-center justify-between rounded-xl px-4 py-3"
                style={{ backgroundColor: accentSoft }}
              >
                <span className="text-sm font-medium text-gray-600">Order type</span>
                <span className="text-sm font-semibold text-gray-900">{selectedOrderTypeData.name}</span>
              </div>
            )}
            {checkout.scheduledForLabel && (
              <div
                className="flex items-center justify-between rounded-xl px-4 py-3"
                style={{ backgroundColor: accentSoft }}
              >
                <span className="text-sm font-medium text-gray-600">
                  {selectedOrderTypeData?.type === 'delivery' ? 'Arriving' : 'Ready'}
                </span>
                <span className="text-sm font-semibold text-gray-900">{checkout.scheduledForLabel}</span>
              </div>
            )}
            <div className="rounded-xl border border-gray-100 p-4">
              <OrderSummaryLines checkout={checkout} />
            </div>
          </div>

          {/* Footer navigation */}
          <div className="mt-7 flex items-center gap-3 border-t border-gray-100 pt-5">
            <button
              type="button"
              onClick={goBack}
              disabled={isFirstStep}
              className="inline-flex h-12 items-center justify-center gap-1.5 rounded-full border border-gray-300 px-5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>

            {isLastStep ? (
              <CheckoutCTA checkout={checkout} className="flex-1" />
            ) : (
              <button
                type="button"
                onClick={goNext}
                disabled={!stepValid}
                className="inline-flex h-12 flex-1 items-center justify-center rounded-full text-sm font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ backgroundColor: accent, color: accentText }}
              >
                Continue
              </button>
            )}
          </div>

          {continueHint && !isLastStep && (
            <p className="mt-3 text-center text-xs font-medium text-amber-600">{continueHint}</p>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          Your order will be sent to {tenant.name} for confirmation.
        </p>
      </main>
    </div>
  )
}
