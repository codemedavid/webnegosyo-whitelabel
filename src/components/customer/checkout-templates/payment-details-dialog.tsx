'use client'

/**
 * Payment-details sheet shown after "Proceed to Payment" (shared across every
 * checkout design).
 *
 * A phone-first bottom sheet (centered card from `sm:` up) with three fixed
 * regions so the two things a diner needs — the amount and the account they
 * pay it to — never scroll away from each other:
 *
 *   header  · method name, the amount to pay, an order breakdown disclosure
 *   body    · QR, copyable account rows, proof of payment
 *   footer  · what happens next + the one submit action
 *
 * All money comes from the hook (`grandTotal`, `total`, fees); nothing is
 * re-summed here. Brand colors come from the tenant's checkout palette.
 */

import { useEffect, useId, useRef } from 'react'
import { CheckCircle2, ChevronDown, Maximize2, MessageCircle, X } from 'lucide-react'
import { formatPrice } from '@/lib/cart-utils'
import { resolveFinalSubmitLabel } from '@/lib/messenger-availability'
import { getCheckoutPalette } from '@/lib/branding-utils'
import { parsePaymentDetailLines } from '@/lib/payment-details-lines'
import { isPaymentProofRequired, isPaymentProofSatisfied } from '@/lib/payment-proof'
import { PaymentProofField } from '@/components/customer/payment-proof-field'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import type { PaymentMethod } from '@/types/database'
import { PaymentDetailRows } from './payment-detail-rows'

/** Gate: only mounts the sheet (and its effects) while the step is open. */
export function PaymentDetailsDialog({ checkout }: { checkout: UseCheckoutReturn }) {
  const { showPaymentDetails, selectedPaymentMethod, paymentMethods } = checkout
  const method = paymentMethods.find((m) => m.id === selectedPaymentMethod) ?? null
  if (!showPaymentDetails || !method) return null
  return <PaymentSheet checkout={checkout} method={method} />
}

function PaymentSheet({ checkout, method }: { checkout: UseCheckoutReturn; method: PaymentMethod }) {
  const {
    total, deliveryFee, deliveryFeeAddress, customerData, grandTotal, tenant, branding,
    serviceChargeAmount, isProcessing, handleCheckout, handleQrHandoff, setShowPaymentDetails,
    handleCopyText, copiedText, openQrDialog,
    paymentProofUrl, paymentProofReference, setPaymentProofReference,
    handlePaymentProofUploaded, handleRemovePaymentProof, messengerEnabled,
  } = checkout

  const palette = getCheckoutPalette(tenant, branding)
  const titleId = useId()
  const sheetRef = useRef<HTMLDivElement>(null)

  const proofRequired = isPaymentProofRequired(method)
  const proofSatisfied = isPaymentProofSatisfied(method, {
    screenshotUrl: paymentProofUrl,
    reference: paymentProofReference,
  })
  const isQrHandoff = !!tenant?.qr_handoff_enabled
  const detailRows = parsePaymentDetailLines(method.details)
  const hasDeliveryFee =
    deliveryFee !== null && deliveryFee > 0 && deliveryFeeAddress === customerData.delivery_address
  const isBlockedOnProof = proofRequired && !proofSatisfied
  const submitLabel = resolveFinalSubmitLabel({ isMessengerEnabled: !isQrHandoff && messengerEnabled })

  const close = () => {
    if (!isProcessing) setShowPaymentDetails(false)
  }

  // Trap the page behind the sheet: lock scroll, take focus, close on Escape.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    sheetRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
    // `close` is recreated per render; the handler only needs the latest state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProcessing])

  const proofField = (
    <PaymentProofField
      required={proofRequired}
      accent={palette.accent}
      screenshotUrl={paymentProofUrl}
      reference={paymentProofReference}
      onUploaded={handlePaymentProofUploaded}
      onRemove={handleRemovePaymentProof}
      onReferenceChange={setPaymentProofReference}
    />
  )

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-gray-950/60 backdrop-blur-[2px] sm:items-center sm:p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
      onClick={close}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[94dvh] w-full flex-col rounded-t-3xl bg-white shadow-2xl outline-none sm:max-h-[88vh] sm:max-w-md sm:rounded-3xl motion-safe:animate-in motion-safe:slide-in-from-bottom motion-safe:duration-300 motion-safe:ease-out sm:motion-safe:slide-in-from-bottom-4 sm:motion-safe:fade-in"
        style={{ ['--checkout-accent' as string]: palette.accent }}
      >
        {/* Header: what you pay, and to whom. */}
        <header className="shrink-0 border-b border-gray-100 px-5 pb-4 pt-3 sm:pt-5">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-gray-200 sm:hidden" aria-hidden="true" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Paying with</p>
              <h2 id={titleId} className="truncate text-lg font-semibold leading-tight text-gray-900">
                {method.name}
              </h2>
            </div>
            <button
              type="button"
              onClick={close}
              disabled={isProcessing}
              aria-label="Back to checkout"
              className="-mr-2 -mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm text-gray-500">Total to pay</p>
              <p className="text-4xl font-bold tracking-tight text-gray-900 tabular-nums">
                {formatPrice(grandTotal)}
              </p>
            </div>
          </div>

          <details className="group mt-2">
            <summary className="inline-flex cursor-pointer select-none list-none items-center gap-1 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 [&::-webkit-details-marker]:hidden">
              Order breakdown
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <dl className="mt-2 space-y-1.5 rounded-xl bg-gray-50 px-4 py-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-600">Subtotal</dt>
                <dd className="font-medium tabular-nums text-gray-900">{formatPrice(total)}</dd>
              </div>
              {/* Same staleness guard the summary uses: a fee quoted for a
                  different address is not billed, so it is not shown either. */}
              {hasDeliveryFee && (
                <div className="flex justify-between">
                  <dt className="text-gray-600">Delivery fee</dt>
                  <dd className="font-medium tabular-nums text-gray-900">{formatPrice(deliveryFee ?? 0)}</dd>
                </div>
              )}
              {serviceChargeAmount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-gray-600">Service charge</dt>
                  <dd className="font-medium tabular-nums text-gray-900">{formatPrice(serviceChargeAmount)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-gray-200 pt-1.5 font-semibold">
                <dt className="text-gray-900">Total</dt>
                <dd className="tabular-nums text-gray-900">{formatPrice(grandTotal)}</dd>
              </div>
            </dl>
          </details>
        </header>

        {/* Body: how to pay. */}
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5">
          {method.qr_code_url && (
            <section className="rounded-2xl bg-gray-50 p-5" aria-label="Payment QR code">
              <button
                type="button"
                onClick={() => openQrDialog(method.qr_code_url!)}
                aria-label="Enlarge payment QR code"
                className="group mx-auto block rounded-2xl bg-white p-3 shadow-lg shadow-gray-900/10 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--checkout-accent)] motion-safe:active:scale-[0.98]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={method.qr_code_url}
                  alt={`${method.name} payment QR code`}
                  className="h-52 w-52 object-contain"
                />
              </button>
              <p className="mt-4 text-center text-sm font-medium text-gray-900">
                Scan to pay with {method.name}
              </p>
              <button
                type="button"
                onClick={() => openQrDialog(method.qr_code_url!)}
                className="mx-auto mt-1.5 inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-80"
                style={{ color: palette.accent }}
              >
                <Maximize2 className="h-3.5 w-3.5" /> Enlarge QR
              </button>
            </section>
          )}

          {detailRows.length > 0 && (
            <section aria-label="Account details">
              <h3 className="mb-2 text-sm font-semibold text-gray-900">
                {method.qr_code_url ? 'Or send to' : 'Send payment to'}
              </h3>
              <PaymentDetailRows
                rows={detailRows}
                copiedText={copiedText}
                onCopy={handleCopyText}
                accent={palette.accent}
              />
            </section>
          )}

          {/* Proof sits right after the pay instructions, so a phone never has to
              scroll to find the thing that unblocks the button. */}
          {proofField}
        </div>

        {/* Footer: what happens next, and the one action. */}
        <footer
          className="shrink-0 border-t border-gray-100 bg-white px-5 pt-4"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <p className="mb-3 text-center text-[13px] leading-snug text-gray-600" aria-live="polite">
            {isBlockedOnProof
              ? 'Attach a screenshot or enter your reference number to continue.'
              : isQrHandoff
                ? 'After paying, tap below to get your order QR for the cashier.'
                : messengerEnabled
                  ? 'After paying, tap below to send your order to the restaurant on Messenger.'
                  : 'After paying, tap below to submit your order to the restaurant.'}
          </p>
          <button
            type="button"
            onClick={isQrHandoff ? handleQrHandoff : handleCheckout}
            disabled={isProcessing || isBlockedOnProof}
            className="inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-full text-base font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[color:var(--checkout-accent)]"
            style={{ backgroundColor: palette.button ?? palette.accent, color: palette.accentText }}
          >
            {isProcessing ? (
              <>
                <span className="h-5 w-5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                Processing...
              </>
            ) : (
              <>
                {isQrHandoff || !messengerEnabled
                  ? <CheckCircle2 className="h-5 w-5" />
                  : <MessageCircle className="h-5 w-5" />}
                {submitLabel}
              </>
            )}
          </button>
          <button
            type="button"
            onClick={close}
            disabled={isProcessing}
            className="mt-1 inline-flex h-11 w-full items-center justify-center rounded-full text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 disabled:opacity-40"
          >
            Go back
          </button>
        </footer>
      </div>
    </div>
  )
}
