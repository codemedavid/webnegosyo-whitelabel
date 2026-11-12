'use client'

/**
 * "Preview the payment step" for the Page Designer's checkout Look tab: the
 * real PaymentStep, drawn in a phone frame over a SAMPLE checkout with the
 * Look tab's unsaved edits. The step is not part of the page design (it opens
 * after Proceed to Payment, on every checkout), so it gets its own preview
 * rather than a block on the canvas. Nothing is sent or uploaded.
 */

import { Eye, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { readPaymentStepStyle } from '@/lib/payment-step/style'
import { PaymentStep } from '@/components/customer/checkout-templates/payment-step'
import { SAMPLE_PAYMENT_METHOD } from '@/components/customer/checkout-templates/payment-step-state'
import { StorefrontLabelsProvider } from '@/components/customer/storefront-labels-provider'
import { buildSampleCheckout } from '@/components/page-designer/checkout/sample-checkout'
import { storePalette } from '@/components/page-designer/samples/checkout-samples'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'

const noop = (): void => undefined

function PreviewFrame({ row, onClose }: { row: Readonly<Record<string, unknown>>; onClose: () => void }) {
  const [reference, setReference] = useState('')
  const style = useMemo(() => readPaymentStepStyle(row), [row])
  const checkout = useMemo((): UseCheckoutReturn => {
    const sample = buildSampleCheckout(storePalette(row), typeof row.name === 'string' ? row.name : undefined)
    return {
      ...sample,
      paymentProofUrl: '',
      paymentProofReference: reference,
      setPaymentProofReference: setReference,
      handlePaymentProofUploaded: noop,
      handleRemovePaymentProof: noop,
      setShowPaymentDetails: noop,
      handleCheckout: async () => undefined,
      handleQrHandoff: noop,
    } as UseCheckoutReturn
  }, [row, reference])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-neutral-950/70 p-4" onClick={onClose}>
      <div className="flex flex-col items-center gap-3" onClick={(event) => event.stopPropagation()}>
        <div className="flex w-[390px] max-w-full items-center justify-between text-white">
          <p className="text-sm font-semibold">Payment step preview · sample order</p>
          <button type="button" onClick={onClose} aria-label="Close preview" className="rounded-full p-1.5 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div
          className="relative h-[min(760px,calc(100dvh-6rem))] w-[390px] max-w-full overflow-hidden rounded-[2rem] border-[6px] border-neutral-900 bg-[var(--co-bg)] shadow-2xl"
          style={{ ['--co-bg' as string]: storePalette(row).bg }}
        >
          {/* The checkout behind an overlay layout, as grey placeholder rows. */}
          <div aria-hidden="true" className="space-y-3 p-5">
            {[40, 70, 55, 85, 60].map((width, index) => (
              <div key={index} className="h-10 rounded-xl bg-black/5" style={{ width: `${width}%` }} />
            ))}
          </div>
          <StorefrontLabelsProvider tenant={row}>
            <PaymentStep checkout={checkout} method={SAMPLE_PAYMENT_METHOD} style={style} isPreview isContained />
          </StorefrontLabelsProvider>
        </div>
        <p className="max-w-[390px] text-center text-xs text-white/70">
          The receipt upload shows only for payment methods set to “Require payment proof”.
        </p>
      </div>
    </div>
  )
}

/** The button in the Look tab, and the preview it opens. */
export function PaymentStepPreviewButton({ row }: { row: Readonly<Record<string, unknown>> }) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-50"
      >
        <Eye className="h-3.5 w-3.5" /> Preview the payment step
      </button>
      {isOpen && <PreviewFrame row={row} onClose={() => setIsOpen(false)} />}
    </>
  )
}
