'use client'

/**
 * The checkout's payment step, shown after "Proceed to Payment" (shared across
 * every checkout design, the Page Designer's included).
 *
 * Three fixed regions, so the amount and the account it is paid to never
 * scroll away from each other:
 *
 *   header  · method name, the amount to pay, an order breakdown disclosure
 *   body    · QR, copyable account rows, proof of payment (only when required)
 *   footer  · what happens next + the one submit action
 *
 * How it opens is the owner's choice (`payment_step_style.layout`, Branding
 * Studio → Payment step):
 *
 *   sheet       bottom sheet on phones, a card from `sm:` up (the default and
 *               the pre-2026-11-12 look)
 *   popup       a card in the middle, phones included
 *   fullscreen  a full-screen panel over the checkout
 *   screen      a screen of its own: the checkout view hides the form (kept
 *               mounted, so a wizard keeps its step) and renders this in place
 *
 * `fullscreen` and `screen` feel like a page, so they answer the phone's Back
 * button: opening pushes ONE same-URL history entry (Next.js' patched
 * pushState keeps its router state on it, so going back never reloads), Back
 * closes the step, and the in-step back button pops that entry.
 *
 * All money comes from the hook (`grandTotal`, `total`, fees); nothing is
 * re-summed here. Colours: the checkout palette, under the owner's
 * `payment_step_style` colours (`resolvePaymentStepColors`).
 */

import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react'
import { ArrowLeft, CheckCircle2, ChevronDown, Maximize2, MessageCircle, X } from 'lucide-react'
import { toast } from 'sonner'
import { formatPrice } from '@/lib/cart-utils'
import { resolveFinalSubmitLabel } from '@/lib/messenger-availability'
import { getCheckoutPalette } from '@/lib/branding-utils'
import { parsePaymentDetailLines } from '@/lib/payment-details-lines'
import { isPaymentProofRequired, isPaymentProofSatisfied } from '@/lib/payment-proof'
import { resolvePaymentStepColors } from '@/lib/payment-step/colors'
import { isPageLikeLayout, type PaymentStepStyle } from '@/lib/payment-step/style'
import { cn } from '@/lib/utils'
import { PaymentProofField } from '@/components/customer/payment-proof-field'
import { useStorefrontLabel } from '@/components/customer/storefront-labels-provider'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import type { PaymentMethod } from '@/types/database'
import { PaymentDetailRows } from './payment-detail-rows'
import { checkoutThemeStyle } from './checkout-theme'

/** Marks the history entry the step pushed (Next.js keeps its own state beside it). */
const HISTORY_MARK = 'wnPaymentStep'

export interface PaymentStepProps {
  checkout: UseCheckoutReturn
  method: PaymentMethod
  style: PaymentStepStyle
  /**
   * Studio / Page Designer preview: nothing is sent or uploaded, the step
   * can't be closed, and the page's history and scroll are left alone.
   */
  isPreview?: boolean
  /**
   * Draw inside the nearest positioned box instead of the viewport (the Page
   * Designer's phone frame).
   */
  isContained?: boolean
}

function hasHistoryMark(): boolean {
  const state = window.history.state as Record<string, unknown> | null
  return Boolean(state && state[HISTORY_MARK])
}

/**
 * Page-like layouts: one history entry while open, so the phone's Back
 * button closes the step instead of leaving the checkout.
 */
function useBackButtonCloses(isActive: boolean, onBack: () => void): { close: () => void } {
  const onBackRef = useRef(onBack)
  onBackRef.current = onBack
  const pushedRef = useRef(false)

  useEffect(() => {
    if (!isActive) return
    if (!hasHistoryMark()) {
      window.history.pushState({ [HISTORY_MARK]: true }, '')
      pushedRef.current = true
    }
    const onPopState = () => {
      if (hasHistoryMark()) return
      pushedRef.current = false
      onBackRef.current()
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [isActive])

  return {
    // The in-step back button: pop our entry (popstate then closes), or just close.
    close: () => {
      if (isActive && pushedRef.current && hasHistoryMark()) window.history.back()
      else onBackRef.current()
    },
  }
}

/** Overlays: lock the page behind, take focus, close on Escape. */
function useOverlayFocus(isActive: boolean, sheetRef: React.RefObject<HTMLDivElement | null>, onEscape: () => void, lockScroll: boolean) {
  const onEscapeRef = useRef(onEscape)
  onEscapeRef.current = onEscape
  useEffect(() => {
    if (!isActive) return
    const previousOverflow = document.body.style.overflow
    if (lockScroll) document.body.style.overflow = 'hidden'
    sheetRef.current?.focus({ preventScroll: true })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onEscapeRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      if (lockScroll) document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isActive, lockScroll, sheetRef])
}

/**
 * "Its own screen": start at the top, and give the form its scroll back
 * afterwards. A cleanup immediately followed by a re-run (React's dev double
 * effect, a re-render) must not restore the form's scroll over the step, so
 * the restore waits a frame and the next run cancels it.
 */
function useScreenScroll(isActive: boolean) {
  const savedY = useRef<number | null>(null)
  const pendingRestore = useRef<number | null>(null)
  useEffect(() => {
    if (!isActive) return
    if (pendingRestore.current !== null) {
      cancelAnimationFrame(pendingRestore.current)
      pendingRestore.current = null
    }
    if (savedY.current === null) savedY.current = window.scrollY
    // 'instant': the storefront sets `scroll-behavior: smooth`, and a smooth
    // scroll from deep in the form gets cut short, leaving the step half off screen.
    window.scrollTo({ top: 0, behavior: 'instant' })
    return () => {
      pendingRestore.current = requestAnimationFrame(() => {
        pendingRestore.current = null
        const y = savedY.current ?? 0
        savedY.current = null
        window.scrollTo({ top: y, behavior: 'instant' })
      })
    }
  }, [isActive])
}

export function PaymentStep({ checkout, method, style, isPreview = false, isContained = false }: PaymentStepProps) {
  const {
    total, deliveryFee, deliveryFeeAddress, customerData, grandTotal, tenant, branding,
    serviceChargeAmount, isProcessing, handleCheckout, handleQrHandoff, setShowPaymentDetails,
    handleCopyText, copiedText, openQrDialog,
    paymentProofUrl, paymentProofReference, setPaymentProofReference,
    handlePaymentProofUploaded, handleRemovePaymentProof, messengerEnabled,
  } = checkout
  const { layout, upload_design: uploadDesign, header_style: headerStyle, show_breakdown: showBreakdown } = style.options

  const palette = getCheckoutPalette(tenant, branding)
  const colors = resolvePaymentStepColors(palette, style)
  const titleId = useId()
  const sheetRef = useRef<HTMLDivElement>(null)

  const words = {
    payingWith: useStorefrontLabel('payment.paying_with', 'Paying with'),
    total: useStorefrontLabel('payment.total', 'Total to pay'),
    blocked: useStorefrontLabel('payment.blocked', 'Attach a screenshot or enter your reference number to continue.'),
    nextStep: useStorefrontLabel('payment.next_step', ''),
    back: useStorefrontLabel('payment.back', 'Go back'),
  }

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

  const isLive = !isPreview
  const isPageLike = isPageLikeLayout(layout)
  const isScreen = layout === 'screen'

  const closeNow = () => {
    if (isLive && !isProcessing) setShowPaymentDetails(false)
  }
  const history = useBackButtonCloses(isLive && isPageLike && !isContained, () => {
    // Back while the order is being sent: it is on its way, keep the step (and its spinner).
    if (isProcessing) {
      window.history.pushState({ [HISTORY_MARK]: true }, '')
      return
    }
    setShowPaymentDetails(false)
  })
  const close = () => {
    if (!isLive || isProcessing) return
    if (isPageLike && !isContained) history.close()
    else closeNow()
  }

  useOverlayFocus(isLive && !isContained, sheetRef, close, !isScreen)
  useScreenScroll(isLive && isScreen && !isContained)

  const submit = () => {
    if (isPreview) {
      toast.info('Preview only — customers send their order here.')
      return
    }
    if (isQrHandoff) handleQrHandoff()
    else void handleCheckout()
  }

  const nextStepLine = isBlockedOnProof
    ? words.blocked
    : words.nextStep ||
      (isQrHandoff
        ? 'After paying, tap below to get your order QR for the cashier.'
        : messengerEnabled
          ? 'After paying, tap below to send your order to the restaurant on Messenger.'
          : 'After paying, tap below to submit your order to the restaurant.')

  const isBand = headerStyle === 'band'
  const headerColors: CSSProperties = isBand ? { backgroundColor: colors.band, color: colors.bandText } : {}
  const backButton = (
    <button
      type="button"
      onClick={close}
      disabled={isProcessing}
      aria-label="Back to checkout"
      className={cn(
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full opacity-80 transition-opacity hover:opacity-100 disabled:opacity-40',
        isPageLike ? '-ml-2' : '-mr-2 -mt-1',
      )}
    >
      {isPageLike ? <ArrowLeft className="h-5 w-5" /> : <X className="h-5 w-5" />}
    </button>
  )

  const header = (
    <header
      data-branding-scope="payment/header"
      className={cn(
        'shrink-0 px-5 pb-5',
        isPageLike ? 'pt-3' : layout === 'sheet' ? 'pt-3 sm:pt-5' : 'pt-5',
        !isBand && 'border-b border-[color:var(--co-border)] bg-[var(--co-card)] text-[color:var(--co-text)]',
      )}
      style={headerColors}
    >
      {layout === 'sheet' && (
        <div
          className={cn('mx-auto mb-4 h-1.5 w-10 rounded-full opacity-40 sm:hidden', !isBand && 'bg-[var(--co-text)]')}
          style={isBand ? { backgroundColor: colors.bandText } : undefined}
          aria-hidden="true"
        />
      )}
      <div className={cn('flex gap-3', isPageLike ? 'items-center' : 'items-start justify-between')}>
        {isPageLike && backButton}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider opacity-80">{words.payingWith}</p>
          <h2 id={titleId} className="truncate text-xl font-semibold leading-tight">
            {method.name}
          </h2>
        </div>
        {!isPageLike && backButton}
      </div>

      <p className="mt-5 text-sm opacity-80">{words.total}</p>
      <p className="text-[2.75rem] font-bold leading-none tracking-tight tabular-nums" style={isBand ? undefined : { color: colors.accent }}>
        {formatPrice(grandTotal)}
      </p>

      {showBreakdown && (
        <details className="group mt-3">
          <summary className="inline-flex cursor-pointer select-none list-none items-center gap-1 text-sm font-medium opacity-80 transition-opacity hover:opacity-100 [&::-webkit-details-marker]:hidden">
            Order breakdown
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <dl
            className={cn(
              'mt-2 space-y-1.5 rounded-xl px-4 py-3 text-sm text-[color:var(--co-text)]',
              isBand ? 'bg-[var(--co-card)]' : 'bg-[var(--co-subtle)]',
            )}
          >
            <div className="flex justify-between">
              <dt className="text-[color:var(--co-muted)]">Subtotal</dt>
              <dd className="font-medium tabular-nums">{formatPrice(total)}</dd>
            </div>
            {/* Same staleness guard the summary uses: a fee quoted for a
                different address is not billed, so it is not shown either. */}
            {hasDeliveryFee && (
              <div className="flex justify-between">
                <dt className="text-[color:var(--co-muted)]">Delivery fee</dt>
                <dd className="font-medium tabular-nums">{formatPrice(deliveryFee ?? 0)}</dd>
              </div>
            )}
            {serviceChargeAmount > 0 && (
              <div className="flex justify-between">
                <dt className="text-[color:var(--co-muted)]">Service charge</dt>
                <dd className="font-medium tabular-nums">{formatPrice(serviceChargeAmount)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-[color:var(--co-border)] pt-1.5 font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatPrice(grandTotal)}</dd>
            </div>
          </dl>
        </details>
      )}
    </header>
  )

  const body = (
    <div data-branding-scope="payment/colors" className={cn('space-y-5 px-5 py-5', !isScreen && 'min-h-0 flex-1 overflow-y-auto overscroll-contain', isScreen && 'flex-1')}>
      {method.qr_code_url && (
        <section className="rounded-2xl bg-[var(--co-subtle)] p-5" aria-label="Payment QR code">
          <button
            type="button"
            onClick={() => openQrDialog(method.qr_code_url!)}
            aria-label="Enlarge payment QR code"
            className="group mx-auto block rounded-2xl bg-white p-3 shadow-lg shadow-black/10 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--co-accent)] motion-safe:active:scale-[0.98]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={method.qr_code_url} alt={`${method.name} payment QR code`} className="h-52 w-52 object-contain" />
          </button>
          <p className="mt-4 text-center text-sm font-medium text-[color:var(--co-text)]">Scan to pay with {method.name}</p>
          <button
            type="button"
            onClick={() => openQrDialog(method.qr_code_url!)}
            className="mx-auto mt-1.5 inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-80"
            style={{ color: colors.accent }}
          >
            <Maximize2 className="h-3.5 w-3.5" /> Enlarge QR
          </button>
        </section>
      )}

      {detailRows.length > 0 && (
        <section aria-label="Account details">
          <h3 className="mb-2 text-sm font-semibold text-[color:var(--co-text)]">
            {method.qr_code_url ? 'Or send to' : 'Send payment to'}
          </h3>
          <PaymentDetailRows rows={detailRows} copiedText={copiedText} onCopy={handleCopyText} accent={colors.accent} />
        </section>
      )}

      {/* Proof sits right after the pay instructions, so a phone never has to
          scroll to find the thing that unblocks the button. Only for a method
          that asks for it: an optional box nobody fills is noise. */}
      {proofRequired && (
        <div data-branding-scope="payment/upload">
        <PaymentProofField
          required
          design={uploadDesign}
          sampleImage={style.sampleImage}
          isPreviewOnly={isPreview}
          accent={colors.accent}
          accentText={colors.accentText}
          screenshotUrl={paymentProofUrl}
          reference={paymentProofReference}
          onUploaded={handlePaymentProofUploaded}
          onRemove={handleRemovePaymentProof}
          onReferenceChange={setPaymentProofReference}
        />
        </div>
      )}
    </div>
  )

  const footer = (
    <footer
      className={cn('shrink-0 border-t border-[color:var(--co-border)] bg-[var(--co-card)] px-5 pt-4', isScreen && 'sticky bottom-0')}
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      <p className="mb-3 text-center text-[13px] leading-snug text-[color:var(--co-muted)]" aria-live="polite">
        {nextStepLine}
      </p>
      <button
        type="button"
        data-branding-scope="payment/send"
        onClick={submit}
        disabled={isProcessing || isBlockedOnProof}
        className="inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-full text-base font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--co-card)] focus-visible:ring-[color:var(--co-accent)]"
        style={{ backgroundColor: colors.button, color: colors.buttonText }}
      >
        {isProcessing ? (
          <>
            <span className="h-5 w-5 rounded-full border-2 border-current border-t-transparent animate-spin" />
            Processing...
          </>
        ) : (
          <>
            {isQrHandoff || !messengerEnabled ? <CheckCircle2 className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
            {submitLabel}
          </>
        )}
      </button>
      <button
        type="button"
        onClick={close}
        disabled={isProcessing}
        className="mt-1 inline-flex h-11 w-full items-center justify-center rounded-full text-sm font-medium text-[color:var(--co-muted)] transition-colors hover:text-[color:var(--co-text)] disabled:opacity-40"
      >
        {words.back}
      </button>
    </footer>
  )

  const themeStyle: CSSProperties = { ...checkoutThemeStyle(checkout), ...(colors.accentVars ?? {}) }

  return (
    <StepFrame
      layout={layout}
      isContained={isContained}
      sheetRef={sheetRef}
      titleId={titleId}
      themeStyle={themeStyle}
      onBackdrop={close}
    >
      {header}
      {body}
      {footer}
    </StepFrame>
  )
}

interface StepFrameProps {
  layout: PaymentStepStyle['options']['layout']
  isContained: boolean
  sheetRef: React.RefObject<HTMLDivElement | null>
  titleId: string
  themeStyle: CSSProperties
  onBackdrop: () => void
  children: ReactNode
}

/** The step's chrome for each layout. Everything inside is the same. */
function StepFrame({ layout, isContained, sheetRef, titleId, themeStyle, onBackdrop, children }: StepFrameProps) {
  const panelBase = 'flex flex-col overflow-hidden bg-[var(--co-card)] text-[color:var(--co-text)] outline-none'
  const dialogProps = {
    ref: sheetRef,
    role: 'dialog' as const,
    'aria-modal': true,
    'aria-labelledby': titleId,
    tabIndex: -1,
    style: themeStyle,
    'data-payment-step': layout,
    'data-branding-scope': 'payment/frame',
  }

  if (layout === 'screen') {
    // A page of its own, in the document flow (the browser scrolls it).
    return (
      <div
        className={cn('bg-[var(--co-bg)]', isContained ? 'h-full overflow-y-auto' : 'min-h-dvh')}
        style={themeStyle}
      >
        <div
          {...dialogProps}
          role="region"
          aria-modal={undefined}
          className={cn(
            'mx-auto flex w-full max-w-lg flex-col bg-[var(--co-card)] text-[color:var(--co-text)] outline-none sm:my-6 sm:overflow-hidden sm:rounded-3xl sm:shadow-xl',
            isContained ? 'min-h-full sm:my-0 sm:rounded-none' : 'min-h-dvh sm:min-h-0',
            'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4 motion-safe:duration-200',
          )}
        >
          {children}
        </div>
      </div>
    )
  }

  const position = isContained ? 'absolute inset-0' : 'fixed inset-0'

  if (layout === 'fullscreen') {
    return (
      <div className={cn(position, 'z-[100] flex justify-center bg-[var(--co-bg)]')} style={themeStyle}>
        <div
          {...dialogProps}
          onClick={(event) => event.stopPropagation()}
          className={cn(
            panelBase,
            'h-full w-full sm:max-w-lg sm:border-x sm:border-[color:var(--co-border)]',
            'motion-safe:animate-in motion-safe:slide-in-from-bottom-8 motion-safe:fade-in motion-safe:duration-300 motion-safe:ease-out',
          )}
        >
          {children}
        </div>
      </div>
    )
  }

  const isPopup = layout === 'popup'
  return (
    <div
      className={cn(
        position,
        'z-[100] flex justify-center bg-gray-950/60 backdrop-blur-[2px] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200',
        isPopup ? 'items-center p-4' : 'items-end sm:items-center sm:p-4',
      )}
      onClick={onBackdrop}
    >
      <div
        {...dialogProps}
        onClick={(event) => event.stopPropagation()}
        className={cn(
          panelBase,
          'w-full shadow-2xl',
          isPopup
            ? 'max-h-[88dvh] max-w-md rounded-3xl motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:fade-in motion-safe:duration-200'
            : 'max-h-[94dvh] rounded-t-3xl sm:max-h-[88vh] sm:max-w-md sm:rounded-3xl motion-safe:animate-in motion-safe:slide-in-from-bottom motion-safe:duration-300 motion-safe:ease-out sm:motion-safe:slide-in-from-bottom-4 sm:motion-safe:fade-in',
        )}
      >
        {children}
      </div>
    </div>
  )
}
