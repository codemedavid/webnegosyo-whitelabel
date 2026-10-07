'use client'

/**
 * useCheckout — the shared checkout logic layer.
 *
 * ALL checkout behaviour lives here so that the visual checkout designs
 * (classic / modern / wizard / minimal / express) are pure presentation and
 * never duplicate logic. The return value is the stable API every design
 * consumes via `ReturnType<typeof useCheckout>`.
 *
 * Data arrives with the page. The server reads the tenant (cached), order
 * types, form fields, payment methods, branches and the Messenger page id in
 * one parallel batch (src/lib/checkout/load-checkout-config.ts); this hook
 * never fetches them. Switching order type is a lookup, not a request.
 *
 * What the submit paths SEND is built by pure, unit-tested modules under
 * src/lib/checkout/ (order-items-payload, order-message, messenger-handoff,
 * completed-order, order-submit-fields, upsell-conversion, qr-handoff-payload);
 * this hook only sequences them around state, toasts and the network.
 *
 * Load-bearing invariants preserved from the original monolith — do not change:
 *  - `checkoutCompleteRef.current = true` is set synchronously BEFORE `clearCart()`
 *    so the cart-empty redirect effect can't navigate away mid-confirmation.
 *  - The delivery quote hook invalidates a changed route before effects run
 *    and drops superseded requests. Every submit path checks its validity.
 *  - The confirmation is optimistic, so every refusal the server could make
 *    must be preflighted BEFORE it shows; the Messenger redirect waits on the
 *    save (awaitSaveBeforeRedirect) and never fires for a refused order.
 */

import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef, useMemo } from 'react'
import { isCheckoutCartEmpty } from '@/lib/cart-utils'
import { isMessengerEnabledForOrderType, isMessengerRedirectEnabledForOrderType } from '@/lib/messenger-availability'
import { saveOrderDurably, isOrderSaveRetrySafe } from '@/lib/checkout/durable-order-save'
import { awaitSaveBeforeRedirect } from '@/lib/checkout/messenger-redirect-gate'
import { resolveTrackingRedirect } from '@/lib/checkout/tracking-redirect'
import { classifyOrderSave, type OrderSaveNotice } from '@/lib/checkout/order-save-outcome'
import { useBrandingPreviewTenant } from '@/hooks/use-branding-preview'
import { preflightPresellAction } from '@/app/actions/presell-checkout'
import { preflightCheckoutStockAction } from '@/app/actions/checkout-stock'
import { computeOrderTotals } from '@/lib/order-totals'
import { checkOrderMinimum, formatOrderMinimumMessage } from '@/lib/order-minimum'
import { useCheckoutVouchers } from '@/hooks/checkout/use-checkout-vouchers'
import { useStoreOpenStatus } from '@/hooks/use-store-open-status'
import { STORE_CLOSED_MESSAGE, STORE_PRELAUNCH_MESSAGE } from '@/lib/store-open-status'
import { computeServiceCharge } from '@/lib/order-service-charge'
import { useCart } from '@/hooks/useCart'
import { useKioskMode } from '@/hooks/use-kiosk-mode'
import { useKioskReturn } from '@/hooks/use-kiosk-return'
import { createOrderAction } from '@/app/actions/orders'
import { useCheckoutOutlet } from '@/hooks/use-checkout-outlet'
import { shouldAskFulfillmentMethod } from '@/lib/checkout-fulfillment-choice'
import { getPaymentProofError, isPaymentProofRequired } from '@/lib/payment-proof'
import { isAfterBillingPaymentEnabled, resolvePaymentSubmitPlan } from '@/lib/after-billing-payment'
import { isPaymentDetailsStepSkipped } from '@/lib/payment-details-step'
import { resolveActiveOrderType } from '@/lib/checkout-order-type'
import { clearLinkedTable, preferDineInOrderType, readLinkedTable, seedTableField } from '@/lib/table-qr-param'
import { trackAnalyticsEventAction } from '@/app/actions/analytics'
import { computeChecksum, QR_SIZE_WARN_THRESHOLD } from '@/lib/qr-order-codec'
import { prepareOrderQr } from '@/lib/qr-order-capacity'
import { savePendingOrder } from '@/lib/qr-pending-order'
import { normalizeCustomerData } from '@/lib/customer-field-normalization'
import { validateCheckoutFields } from '@/lib/checkout-field-validation'
import { withSmsConsent } from '@/lib/sms-consent'
import { getTenantBranding } from '@/lib/branding-utils'
import {
  carryOverCustomerData,
  formFieldsForOrderType,
  paymentMethodsForOrderType,
  reconcilePaymentSelection,
  type CheckoutConfig,
} from '@/lib/checkout/checkout-config'
import { findSelectedPaymentMethod } from '@/lib/checkout/checkout-cta'
import { buildCompletedOrderSnapshot, type CompletedOrderData } from '@/lib/checkout/completed-order'
import { resolveMessengerHandoff, shouldSendOrderProactively, type MessengerHandoff } from '@/lib/checkout/messenger-handoff'
import { buildOrderItemsPayload, toPresellPreflightLines, toStockPreflightLines } from '@/lib/checkout/order-items-payload'
import { buildOrderMessage } from '@/lib/checkout/order-message'
import {
  buildOrderCustomerInfo,
  buildPaymentProofPayload,
  mintClientOrderId,
  resolveQuoteForOrder,
  scheduleCustomerFields,
} from '@/lib/checkout/order-submit-fields'
import { buildQrOrderPayload } from '@/lib/checkout/qr-handoff-payload'
import { summarizeUpsellConversions } from '@/lib/checkout/upsell-conversion'
import { rememberActiveOrder } from '@/lib/checkout/active-orders-storage'
import { useDeliveryQuote } from '@/hooks/checkout/use-delivery-quote'
import { useCheckoutSchedule } from '@/hooks/checkout/use-checkout-schedule'
import { amountToFreeDelivery, resolveFreeDeliveryThreshold, waiveDeliveryFee } from '@/lib/free-delivery'
import { usePaymentProof } from '@/hooks/checkout/use-payment-proof'
import { toast } from 'sonner'
import type { QrOrderPayloadV1 } from '@/types/qr-order'
import type { Tenant } from '@/types/database'

export type { CompletedOrderData }

type CreateOrderResult = Awaited<ReturnType<typeof createOrderAction>>

/** Seconds the confirmation screen counts down before it opens Messenger. */
const COUNTDOWN_SECONDS = 3

/** How long the "copied" tick stays on a copied payment detail. */
const COPIED_FEEDBACK_MS = 2000

export interface UseCheckoutInput {
  tenantSlug: string
  /** The storefront tenant row, read on the server (cached). */
  initialTenant: Tenant
  /** Order types, form fields, payment methods, branches — read on the server. */
  config: CheckoutConfig
}

export function useCheckout({ tenantSlug, initialTenant, config }: UseCheckoutInput) {
  const router = useRouter()
  const {
    items,
    bundleItems,
    total,
    clearCart,
    orderType,
    setOrderType,
    messengerPsid,
    isHydrated: isCartHydrated,
  } = useCart()

  // A counter tablet running `?kiosk=1` serves a queue, not a person: it never
  // hands off to Messenger, and it returns itself to the menu after an order.
  const { isKiosk } = useKioskMode(tenantSlug)

  // Branding Studio live preview — merges the editor's unsaved draft over the
  // saved tenant when the checkout page renders inside the preview iframe.
  const tenant = useBrandingPreviewTenant(initialTenant)
  const orderTypes = config.orderTypes

  /**
   * Whether the stored order type has been checked against THIS tenant's list.
   * The stored id is shared across every store on the platform (see
   * lib/checkout-order-type), so it must not drive the form until then. Waits
   * for the cart's storage read: resolving before it — as the old fetch chain
   * did on a hard refresh, from a stale closure — replaced the customer's
   * chosen order type with the tenant's first one.
   */
  const [isOrderTypeResolved, setIsOrderTypeResolved] = useState(false)
  // Nothing is fetched any more: "loading" is only the one tick it takes to
  // read the cart and the order type out of browser storage.
  const isLoading = !isCartHydrated || !isOrderTypeResolved

  const formFields = formFieldsForOrderType(config, orderType)
  const [customerData, setCustomerData] = useState<Record<string, string>>({})
  // Permission to text this customer later. Deliberately NOT part of
  // `customerData`: that map is `Record<string, string>`, and both consent read
  // sites compare with `=== true`, so a string "true" would be silently
  // ignored and the customer would never become reachable. See lib/sms-consent.
  const [isSmsOptedIn, setIsSmsOptedIn] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [checkoutComplete, setCheckoutComplete] = useState(false)
  const checkoutCompleteRef = useRef(false) // Sync ref to prevent race with cart empty useEffect
  /**
   * One id per checkout attempt, so a retry of the SAME attempt — a double tap,
   * a flaky network, a resubmit after an error — is deduped server-side into
   * the order the first attempt already created instead of charging twice.
   * Minted lazily and kept for the life of this checkout; a genuinely new
   * order starts from a fresh mount and so a fresh id.
   */
  const clientOrderIdRef = useRef<string | null>(null)

  /**
   * The in-flight order save, so the Messenger redirect can wait for it.
   *
   * Opening an m.me deep link on a phone hands the browser to the Messenger
   * app and freezes this tab, abandoning any request still in flight. That is
   * how an order reached the merchant in Messenger and never reached the
   * database. Null when there is nothing to wait for.
   */
  const orderSavePromiseRef = useRef<Promise<unknown> | null>(null)
  /** Set when every retry of the order save has failed. Surfaced to the customer. */
  // What the save actually came back with. `null` until it settles, which is
  // also the state the optimistic confirmation screen renders under.
  const [orderSaveNotice, setOrderSaveNotice] = useState<OrderSaveNotice | null>(null)
  const orderSaveFailed = orderSaveNotice !== null && orderSaveNotice.verdict !== 'saved'
  // Read by the Messenger countdown, which starts before the save settles and
  // therefore cannot close over the state above.
  const orderRefusedRef = useRef(false)
  const [completedOrderData, setCompletedOrderData] = useState<CompletedOrderData | null>(null)
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null)
  const [trackingToken, setTrackingToken] = useState<string | null>(null)
  // Set once the countdown has opened Messenger, so this tab can move on to tracking.
  const [hasOpenedMessenger, setHasOpenedMessenger] = useState(false)

  // Payment methods linked to the chosen order type. The selection is derived:
  // a choice the new order type does not offer is dropped (an order must never
  // carry a method not linked to its order type) and a sole method preselects.
  const paymentMethods = paymentMethodsForOrderType(config, orderType)
  const [chosenPaymentMethod, setSelectedPaymentMethod] = useState<string | null>(null)
  const selectedPaymentMethod = reconcilePaymentSelection(paymentMethods, chosenPaymentMethod)
  // The chosen method's row, looked up ONCE for every submit path (the old
  // handlers re-ran this find up to four times per tap).
  const selectedPaymentMethodData = findSelectedPaymentMethod(paymentMethods, selectedPaymentMethod)
  const [qrDialogOpen, setQrDialogOpen] = useState(false)
  const [selectedQrCode, setSelectedQrCode] = useState<string | null>(null)
  const [showPaymentDetails, setShowPaymentDetails] = useState(false)
  // Payment proof (screenshot upload and/or reference number)
  const {
    paymentProof,
    setPaymentProofReference,
    handlePaymentProofUploaded,
    handleRemovePaymentProof,
  } = usePaymentProof()
  const [copiedText, setCopiedText] = useState<string | null>(null)
  const [messageExpanded, setMessageExpanded] = useState(false)
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null)

  const branding = useMemo(() => getTenantBranding(tenant), [tenant])

  // Copy to clipboard helper function
  const handleCopyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedText(text)
      toast.success(`${label} copied to clipboard`)
      // Reset copied state after 2 seconds
      setTimeout(() => setCopiedText(null), COPIED_FEEDBACK_MS)
    } catch {
      toast.error('Failed to copy to clipboard')
    }
  }

  // Open the full-size payment QR dialog
  const openQrDialog = (qrCodeUrl: string) => {
    setSelectedQrCode(qrCodeUrl)
    setQrDialogOpen(true)
  }

  // Compute service charge from selected order type
  const selectedOrderTypeData = orderTypes.find(ot => ot.id === orderType)

  // Which branch takes this order. No-ops entirely for single-location tenants.
  const outlet = useCheckoutOutlet({
    tenant,
    tenantSlug,
    orderTypes,
    orderTypeId: orderType,
    initialOutlets: config.outlets,
  })
  // The server's own formula on the server's own base (the pre-discount item
  // subtotal, no delivery fee — see createOrderAction), so the charge shown is
  // the charge billed: rounded, never negative, never a string.
  const serviceChargeAmount = computeServiceCharge(selectedOrderTypeData, total)

  // Advance-order scheduling for the selected order type (see useCheckoutSchedule).
  const {
    now,
    advanceConfig,
    cartPresellDate,
    scheduleMode,
    setScheduleMode,
    scheduleDate,
    setScheduleDate,
    scheduleTime,
    setScheduleTime,
    scheduleDates,
    timeSlots,
    isScheduling,
    scheduledDateObj,
    scheduledForISO,
    scheduledForLabel,
    isScheduleValid,
    handleScheduleDateChange,
  } = useCheckoutSchedule({
    selectedOrderType: selectedOrderTypeData,
    items,
    operatingHours: tenant?.operating_hours,
  })
  // Operating-hours enforcement. A scheduled (advance) order is allowed while
  // the shop is shut — pre-ordering is the point of the feature — so only ASAP
  // checkouts are gated by the hours. A pre-launch store refuses both.
  const openStatus = useStoreOpenStatus(tenant)

  // Delivery fee for the picked address: Lalamove quote OR distance-based fee.
  const {
    deliveryFee: quotedDeliveryFee,
    quotationId,
    quoteSignature,
    isFetchingDeliveryFee,
    deliveryFeeAddress,
    deliveryOutOfRange,
    deliveryDistanceKm,
    deliveryFeeError,
    retryDeliveryQuote,
    getDeliveryQuoteError,
  } = useDeliveryQuote({
    tenant,
    isDeliveryOrder: selectedOrderTypeData?.type === 'delivery',
    deliveryAddress: customerData.delivery_address,
    deliveryLat: customerData.delivery_lat,
    deliveryLng: customerData.delivery_lng,
  })

  // Free delivery above the store's minimum (pre-discount item subtotal). The
  // waived figure is what every design shows and bills; the server re-applies
  // the same rule to the fee it recomputes, so this is only the preview.
  const isDeliveryOrderType = selectedOrderTypeData?.type === 'delivery'
  const freeDeliveryThreshold = isDeliveryOrderType
    ? resolveFreeDeliveryThreshold(tenant?.free_delivery_min_order)
    : null
  const deliveryFee = waiveDeliveryFee(quotedDeliveryFee, total, freeDeliveryThreshold)
  const isDeliveryFeeWaived = quotedDeliveryFee !== null && quotedDeliveryFee > 0 && deliveryFee === 0
  /** ₱ still needed for free delivery; 0 once reached, null when there is no offer. */
  const freeDeliveryRemaining = amountToFreeDelivery(total, freeDeliveryThreshold)

  // All submission paths must agree, including the payment dialog's direct
  // submit and Messenger-only orders that never call createOrderAction.
  const isDeliveryBlocked = (): boolean => {
    if (selectedOrderTypeData?.type !== 'delivery' || !(tenant?.lalamove_enabled || tenant?.distance_delivery_enabled)) return false
    // The scanner payload has no quotation/signature fields, so this flow
    // cannot preserve a verified delivery price or book the quoted route.
    if (tenant.lalamove_enabled && tenant.qr_handoff_enabled) {
      toast.error('Lalamove delivery is unavailable with QR checkout. Please choose pickup or contact the store.')
      return true
    }
    const message = getDeliveryQuoteError()
    if (!message) return false
    toast.error(message)
    return true
  }

  /**
   * Enforce the chosen method's payment-proof requirement (screenshot OR
   * reference). After-billing and skip-details methods still honour this: a
   * proof-required method opens the details step either way, so checkout is
   * never blocked by a UI that was skipped.
   */
  const isPaymentProofMissing = (): boolean => {
    const proofError = getPaymentProofError(selectedPaymentMethodData, {
      screenshotUrl: paymentProof.url,
      reference: paymentProof.reference,
    })
    if (!proofError) return false
    toast.error(proofError)
    return true
  }

  /**
   * Refuse an ASAP checkout while the shop is outside its operating hours.
   * Returns true (and surfaces the reason) when the submit must be aborted.
   * Scheduled orders bypass the hours — see `openStatus` above — but NOT
   * pre-launch: the server refuses a pre-launch store's scheduled orders too
   * (`getClosedOrderError`), and that refusal would land behind "Order Placed!".
   */
  const isOrderingClosed = (): boolean => {
    if (!openStatus.isOrderingBlocked) return false
    if (openStatus.reason === 'prelaunch') {
      toast.error(STORE_PRELAUNCH_MESSAGE)
      return true
    }
    if (isScheduling) return false
    toast.error(
      openStatus.nextOpenLabel
        ? `${STORE_CLOSED_MESSAGE}. Opens ${openStatus.nextOpenLabel}.`
        : `${STORE_CLOSED_MESSAGE}.`
    )
    return true
  }

  /**
   * The guards every submit path runs, in order, before it may start. Each one
   * that trips tells the customer why; short-circuiting keeps it to one toast.
   */
  const hasSubmitBlocker = (): boolean =>
    isOrderingClosed() || isDeliveryBlocked() || isPaymentProofMissing()

  // Derived totals shared by every design so they never recompute the fee/total rules.
  // A fee quoted against a DIFFERENT address than the one currently typed is
  // stale and must not be billed — the summary renders "—" for it, and the
  // total has to agree.
  const validDeliveryFee = (deliveryFee !== null && deliveryFeeAddress === customerData.delivery_address)
    ? deliveryFee
    : null
  const {
    voucherCodes, voucherPreview, effectiveDiscounts,
    isCheckingVoucher, applyVoucherCode, removeVoucherCode,
  } = useCheckoutVouchers({
    tenantId: tenant?.id ?? null,
    items,
    bundleItems,
    validDeliveryFee,
    serviceChargeAmount,
    outletId: outlet.selectedOutletId ?? null,
    isCheckoutComplete: checkoutComplete,
  })

  const { grandTotal } = computeOrderTotals({
    subtotal: total,
    deliveryFee: validDeliveryFee,
    serviceCharge: serviceChargeAmount,
    discounts: effectiveDiscounts,
  })

  // Per-order-type minimum. Measured against the ITEM subtotal, never the grand
  // total — a delivery fee must not carry a small cart over a delivery minimum.
  // Re-derives whenever the customer switches order type, so picking pickup
  // releases a delivery-only gate immediately.
  //
  // Deliberately the pre-discount subtotal: a voucher must not unlock a
  // minimum the cart never actually met.
  const orderMinimum = checkOrderMinimum(total, selectedOrderTypeData)

  // Resolve the order type once the cart has been read from storage. The
  // stored selection is shared across tenants, so it is validated against this
  // tenant's list; a guest who scanned a table code is dining in, whatever the
  // browser last remembered.
  useEffect(() => {
    if (!isCartHydrated || isOrderTypeResolved) return
    const hasLinkedTable = readLinkedTable(window.localStorage, tenantSlug, Date.now()) !== null
    const resolved = preferDineInOrderType(orderTypes, resolveActiveOrderType(orderType, orderTypes), hasLinkedTable)
    if (resolved !== orderType) setOrderType(resolved)
    setIsOrderTypeResolved(true)
  }, [isCartHydrated, isOrderTypeResolved, orderType, orderTypes, setOrderType, tenantSlug])

  // A new order type brings its own form. Keep what the customer already typed
  // into fields both forms share, and pre-fill the table from a scanned code.
  useEffect(() => {
    if (!isOrderTypeResolved) return
    setCustomerData(previous =>
      seedTableField(
        carryOverCustomerData(formFields, previous),
        formFields,
        readLinkedTable(window.localStorage, tenantSlug, Date.now())
      )
    )
  }, [formFields, isOrderTypeResolved, tenantSlug])

  // Redirect to menu if cart is empty
  // Don't redirect if checkout is in progress or has completed (prevents race condition with Messenger redirect)
  const isCartEmpty = isCheckoutCartEmpty(items, bundleItems)
  useEffect(() => {
    if (!isLoading && !isProcessing && !checkoutComplete && !checkoutCompleteRef.current && isCartEmpty) {
      router.push(`/${tenantSlug}/menu`)
    }
  }, [isCartEmpty, router, tenantSlug, isLoading, isProcessing, checkoutComplete])

  // Per-order-type toggle: when off, checkout never touches Messenger and the
  // CTA reads "Complete Order" instead of "Send Order via Messenger".
  // A kiosk overrides both: it also gates the proactive send-order-public POST
  // in PHASE 4, which is already conditioned on `messengerEnabled`.
  const messengerEnabled = isMessengerEnabledForOrderType(selectedOrderTypeData, { isKiosk })

  // Auto-open Messenger only when BOTH the tenant switch and the order type allow it.
  const messengerRedirectEnabled = isMessengerRedirectEnabledForOrderType(tenant, selectedOrderTypeData, { isKiosk })

  // Takes the kiosk back to the menu three seconds after the order. No-ops
  // entirely when `isKiosk` is false, so the phone flow is unchanged.
  const { countdown: kioskCountdown } = useKioskReturn({
    isKiosk,
    isCheckoutComplete: checkoutComplete,
    tenantSlug,
  })

  // Countdown timer: redirect to Messenger after 3 seconds, auto-expand message if no URL
  useEffect(() => {
    if (!checkoutComplete) return
    // When the Messenger redirect is turned off, never auto-open. Expand the
    // order message so the customer can still send it manually.
    if (!messengerRedirectEnabled) {
      setMessageExpanded(true)
      return
    }
    if (!completedOrderData?.messengerUrl) {
      setMessageExpanded(true)
      return
    }
    // Start 3-second countdown
    const messengerUrl = completedOrderData.messengerUrl
    let isCancelled = false

    setRedirectCountdown(COUNTDOWN_SECONDS)
    const interval = setInterval(() => {
      setRedirectCountdown(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    // The countdown is what the customer sees; the save is what the merchant
    // needs. Both have to finish before this tab is handed to the Messenger
    // app, because the deep link freezes it and abandons the request midway.
    // `awaitSaveBeforeRedirect` gives up at its own ceiling, so a hung save
    // delays the redirect but never blocks it.
    const openMessengerWhenSafe = async () => {
      await new Promise<void>(resolve => setTimeout(resolve, COUNTDOWN_SECONDS * 1000))
      // A failed save still opens Messenger: that message is the merchant's
      // only remaining copy of the order, so withholding it would lose the
      // order on both channels.
      //
      // A REFUSED order is the opposite case. The store said no on purpose —
      // below the minimum, sold out, no delivery coordinates — so handing the
      // merchant the message would deliver them an order the platform just
      // rejected, which is how a kitchen ends up cooking a sale that was never
      // accepted. The message stays on screen for the customer to send if they
      // choose; it simply is not sent for them.
      await awaitSaveBeforeRedirect(orderSavePromiseRef.current)
      if (isCancelled || orderRefusedRef.current) return
      window.open(messengerUrl, '_blank', 'noopener,noreferrer')
      setHasOpenedMessenger(true)
    }
    void openMessengerWhenSafe()

    return () => {
      isCancelled = true
      clearInterval(interval)
    }
  }, [checkoutComplete, completedOrderData?.messengerUrl, messengerRedirectEnabled])

  // Once the thank-you screen has nothing left to do — Messenger was opened by
  // the countdown, or there is no Messenger handoff at all — a saved order goes
  // to live tracking. Replace, so Back doesn't land on an emptied checkout.
  const trackingRedirectPath = resolveTrackingRedirect(tenantSlug, {
    isCheckoutComplete: checkoutComplete,
    isMessengerEnabled: messengerEnabled,
    messengerUrl: completedOrderData?.messengerUrl,
    isMessengerAutoOpen: messengerRedirectEnabled,
    hasOpenedMessenger,
    isKiosk,
    trackingOrderId,
    trackingToken,
  })
  useEffect(() => {
    if (trackingRedirectPath) router.replace(trackingRedirectPath)
  }, [trackingRedirectPath, router])

  // QR-handoff flow: build a QrOrderPayloadV1 from the cart + form values,
  // persist it locally, and navigate to the QR thank-you page. NOTHING is
  // written to Convex or Supabase here — the vendor scanner is the sole writer.
  const handleQrHandoff = () => {
    if (!tenant || isProcessing || !orderType) return
    if (hasSubmitBlocker()) return

    setIsProcessing(true)

    try {
      const payload = buildQrOrderPayload({
        cid: crypto.randomUUID(),
        createdAt: Date.now(),
        tenantId: tenant.id,
        tenantSlug,
        orderTypeId: orderType,
        orderType: selectedOrderTypeData,
        // Canonicalize every form field (phone → E.164, email lowercased, text
        // whitespace-collapsed) so the vendor scanner persists a clean record.
        customerData: normalizeCustomerData(customerData, formFields),
        items,
        bundleItems,
        // The same number the summary shows. Built separately it drifted: it
        // omitted the delivery fee entirely, so a delivery order paid by QR
        // asked for less than it billed, and it would have missed any discount.
        total: grandTotal,
        paymentMethod: selectedPaymentMethodData,
        scheduledForISO,
        scheduledForLabel,
        paymentProof,
      })

      const preparedQr = prepareOrderQr(payload)
      if (!preparedQr.ok) {
        console.warn(
          `[Checkout] QR payload length ${preparedQr.encodedLength} exceeds the level-M capacity ${preparedQr.maxEncodedLength}; order was kept in the cart.`
        )
        toast.error('This order has too many details for one QR code. Your cart is unchanged—remove some customizations or split the order, then try again.')
        setIsProcessing(false)
        return
      }

      const { qrString, payload: compactPayload } = preparedQr
      if (qrString.length > QR_SIZE_WARN_THRESHOLD) {
        console.warn(
          `[Checkout] QR payload length ${qrString.length} exceeds warning threshold ${QR_SIZE_WARN_THRESHOLD}; QR may be hard to scan.`
        )
      }

      const fullPayload: QrOrderPayloadV1 = { ...compactPayload, ck: computeChecksum(compactPayload) }

      savePendingOrder(tenantSlug, {
        payload: fullPayload,
        qrString,
        createdAt: compactPayload.t,
        lastStatus: 'pending',
      })

      // Set ref synchronously BEFORE clearCart to prevent race with cart-empty useEffect
      checkoutCompleteRef.current = true
      clearCart()
      // The table was for this order; the next scan names the next one.
      clearLinkedTable(window.localStorage, tenantSlug)
      toast.success('Order ready! Show the QR to the vendor.')
      router.push(`/${tenantSlug}/order/qr/${payload.cid}`)
    } catch (error) {
      console.error('QR handoff error:', error)
      toast.error('Failed to generate order QR. Please try again.')
      setIsProcessing(false)
    }
  }

  const handleProceedToPayment = () => {
    if (isDeliveryBlocked()) return
    // Validate presence AND format. The phone check uses the same normalizer as
    // customer identity, so a number that would be dropped during capture is
    // caught here instead of quietly costing the merchant a customer.
    const fieldErrors = validateCheckoutFields(formFields, customerData)

    if (fieldErrors.length > 0) {
      toast.error(fieldErrors.map(error => error.message).join('\n'))
      return
    }

    // Multi-branch, "at checkout" timing: an order has to belong to a branch.
    if (outlet.isMissingRequiredSelection) {
      toast.error('Please choose a branch for this order')
      return
    }

    // Per-order-type minimum: block submit and name the shortfall, so the customer
    // knows to add items or switch order type rather than retapping a dead button.
    if (!orderMinimum.meets) {
      toast.error(
        formatOrderMinimumMessage(orderMinimum, selectedOrderTypeData?.name) ??
          'This order is below the minimum for checkout'
      )
      return
    }

    // Advance order: validate the scheduled time before proceeding
    if (advanceConfig.enabled) {
      if (!advanceConfig.allowAsap && scheduleMode !== 'scheduled') {
        toast.error('Please schedule a time for this order')
        return
      }
      if (scheduleMode === 'scheduled') {
        if (!scheduledDateObj) {
          toast.error('Please choose a date and time for your advance order')
          document.querySelector('[data-advance-order]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          return
        }
        if (!isScheduleValid) {
          toast.error('That time is no longer available. Please pick another slot.')
          document.querySelector('[data-advance-order]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          return
        }
      }
    }

    // One decision: block until a method is chosen, open the payment-details
    // step (including QR-handoff / after-billing / skip-details methods when the
    // method requires a screenshot), or submit directly.
    const submitPlan = resolvePaymentSubmitPlan({
      hasPaymentMethods: paymentMethods.length > 0,
      hasSelectedPaymentMethod: !!selectedPaymentMethod,
      isAfterBillingPayment: isAfterBillingPaymentEnabled(selectedOrderTypeData),
      requiresPaymentProof: isPaymentProofRequired(selectedPaymentMethodData),
      isQrHandoff: !!tenant?.qr_handoff_enabled,
      skipsPaymentDetails: isPaymentDetailsStepSkipped(selectedPaymentMethodData),
    })

    if (submitPlan === 'blocked-no-method') {
      toast.error('Please select a payment method before proceeding')
      // Scroll to payment methods section
      const paymentSection = document.querySelector('[data-payment-methods]')
      if (paymentSection) {
        paymentSection.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      return
    }

    if (submitPlan === 'payment-details') {
      setShowPaymentDetails(true)
      return
    }

    // QR-handoff: skip Messenger and createOrderAction. The vendor scanner
    // writes the order; the customer just shows a QR. Reached only after the
    // plan above — a proof-required method still collected a screenshot first.
    if (tenant?.qr_handoff_enabled) {
      handleQrHandoff()
      return
    }

    void handleCheckout()
  }

  /**
   * Tell the customer what actually happened to their order.
   *
   * Split out because both the settled-failure path and the thrown path need
   * it, and because the refusal case has a side effect the failure case must
   * not have: it stops the Messenger countdown from delivering the merchant an
   * order the store already turned down.
   */
  const announceOrderSaveNotice = (notice: OrderSaveNotice) => {
    setOrderSaveNotice(notice)
    orderRefusedRef.current = notice.verdict === 'refused'

    // Only promise Messenger to a tenant that actually has it. Naming a
    // recovery the customer cannot perform is the same defect in a new place.
    const canSendMessenger = notice.isMessengerRecoverable && messengerEnabled

    // Only worth surfacing the message box when sending it is the recovery.
    if (canSendMessenger) setMessageExpanded(true)

    toast.error(
      canSendMessenger
        ? `${notice.message} Please send the Messenger message so they receive it.`
        : notice.message,
      { duration: 12000 }
    )
  }

  /**
   * The first preflight refusal's sentence, or null when the store can take the
   * cart. The confirmation screen is optimistic, so a server refusal after it
   * would be invisible: a pre-order re-checks its dates, and every cart asks
   * whether the kitchen can make the number in it. The guards inside
   * createOrderAction stay authoritative; these only move their sentence
   * somewhere visible.
   */
  const findPreflightRefusal = async (tenantId: string): Promise<string | null> => {
    const [presellVerdict, stockVerdict] = await Promise.all([
      cartPresellDate
        ? preflightPresellAction(tenantId, toPresellPreflightLines(items))
        : Promise.resolve({ ok: true } as const),
      preflightCheckoutStockAction(tenantId, toStockPreflightLines(items), outlet.selectedOutletId ?? null),
    ])
    const refusal = [presellVerdict, stockVerdict].find(verdict => !verdict.ok)
    return refusal && !refusal.ok ? refusal.message : null
  }

  /** A saved order: count upsells, hand it to Messenger, and remember it for tracking. */
  const handleOrderSaved = (
    tenantId: string,
    result: CreateOrderResult,
    handoff: MessengerHandoff,
    outletId: string | undefined
  ) => {
    const orderId = result.data?.id

    const upsell = summarizeUpsellConversions(items)
    if (upsell) {
      trackAnalyticsEventAction(tenantId, 'upsell_converted', {
        orderId,
        ...upsell,
        // Additive metadata only — the event name and every existing key are
        // untouched, and the key is absent (not null) for the tenants who have
        // no branches.
        ...(outletId ? { outletId } : {}),
      })
    }

    // Proactive webhook send
    if (shouldSendOrderProactively({ isMessengerEnabled: messengerEnabled, handoff, orderId, orderToken: result.orderToken })) {
      fetch('/api/messenger/send-order-public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, tenantId, orderToken: result.orderToken }),
      }).catch(error => console.warn('[Checkout] Proactive send error:', error))
    }

    // Save tracking data for order status page
    if (orderId && result.trackingToken) {
      setTrackingOrderId(orderId)
      setTrackingToken(result.trackingToken)
      rememberActiveOrder(window.localStorage, tenantSlug, {
        orderId,
        trackingToken: result.trackingToken,
        createdAt: new Date().toISOString(),
      })
    }
  }

  /**
   * PHASE 4: save the order in the background, behind the confirmation screen.
   *
   * That screen is already showing, so this save is the only thing standing
   * between the customer's "Order Placed!" and the merchant hearing about it.
   * It is retried where retrying is proven safe, and the Messenger redirect
   * waits on the promise stored below.
   */
  const saveOrderInBackground = (
    tenantId: string,
    orderTypeId: string,
    normalizedCustomerData: Record<string, string>,
    handoff: MessengerHandoff
  ) => {
    const orderItems = buildOrderItemsPayload(items, bundleItems)
    const customerInfo = buildOrderCustomerInfo(normalizedCustomerData)

    // Which branch is taking this order, under either timing: the splash
    // chooser's stored answer, or the one picked on this very page. Resolved
    // by useCheckoutOutlet, which returns null for the tenants who never
    // turned branches on. The server re-validates it regardless.
    const selectedOutletId = outlet.selectedOutletId ?? undefined

    // Compared against the RAW typed address — see resolveQuoteForOrder.
    const quote = resolveQuoteForOrder({
      deliveryFee,
      quotationId,
      quoteSignature,
      quotedAddress: deliveryFeeAddress,
      currentAddress: customerData.delivery_address,
    })

    // Stable across retries of this attempt — see clientOrderIdRef.
    if (!clientOrderIdRef.current) {
      clientOrderIdRef.current = mintClientOrderId(typeof crypto !== 'undefined' ? crypto : undefined)
    }
    const clientOrderId = clientOrderIdRef.current

    setOrderSaveNotice(null)
    orderRefusedRef.current = false

    // Captured from inside the retry so the success handling below still
    // sees the server's full reply (order id, tokens) rather than just the
    // ok/failed verdict the retry helper reports.
    let saveResult: CreateOrderResult | null = null

    const savePromise = saveOrderDurably(
      async () => {
        const attemptResult = await createOrderAction(
          tenantId, orderItems, customerInfo, orderTypeId,
          withSmsConsent(
            {
              ...normalizedCustomerData,
              ...(messengerPsid ? { messenger_psid: messengerPsid } : {}),
              ...scheduleCustomerFields(scheduledForISO, scheduledForLabel),
            },
            isSmsOptedIn,
            new Date().toISOString()
          ),
          quote.deliveryFee, quote.quotationId,
          selectedPaymentMethod || undefined,
          selectedPaymentMethodData?.name || undefined,
          selectedPaymentMethodData?.details || undefined,
          selectedPaymentMethodData?.qr_code_url || undefined,
          serviceChargeAmount || undefined,
          scheduledForISO || undefined,
          buildPaymentProofPayload(paymentProof),
          selectedOutletId,
          // Codes, not amounts. The server recomputes the discount from these.
          [...voucherCodes],
          clientOrderId,
          quote.quoteSignature
        )
        saveResult = attemptResult
        return { success: attemptResult.success, error: attemptResult.error }
      },
      { attempts: isOrderSaveRetrySafe(tenant) ? undefined : 1 }
    )

    // What the Messenger redirect waits on. Resolves either way — the
    // failure is reported through `orderSaveFailed`, not by rejecting.
    orderSavePromiseRef.current = savePromise

    savePromise.then(save => {
      const result: CreateOrderResult | null = saveResult
      if (save.ok && result?.success) {
        handleOrderSaved(tenantId, result, handoff, selectedOutletId)
        return
      }
      // The customer was told the order was placed and the cart is gone,
      // so a silent console.warn here is how an order disappears without
      // anyone noticing. Say it out loud — and say the RIGHT thing: the
      // store refusing an order and the order going missing need opposite
      // advice, and both used to collapse into one sentence that told a
      // refused customer to hand the merchant the order anyway.
      const notice = classifyOrderSave({
        success: false,
        refused: save.refused ?? result?.refused,
        error: save.error ?? result?.error,
      })
      console.error('[Checkout] Order save did not land:', {
        verdict: notice.verdict,
        reason: save.error ?? result?.error,
      })
      announceOrderSaveNotice(notice)
    }).catch(error => {
      // A throw carries no verdict, so it can only be read as a lost order.
      console.error('[Checkout] Order save error:', error)
      announceOrderSaveNotice(classifyOrderSave(null))
    })
  }

  const handleCheckout = async () => {
    if (!tenant || isProcessing || !orderType) return
    if (hasSubmitBlocker()) return

    setIsProcessing(true)

    try {
      // Canonicalize every form field (phone → E.164, email lowercased, text
      // whitespace-collapsed) up front so the Messenger message, the confirmation
      // snapshot, and the persisted order all carry the same clean values.
      const normalizedCustomerData = normalizeCustomerData(customerData, formFields)

      // ── PHASE 1: Generate order message (instant, no DB) ────────────────
      const message = buildOrderMessage({
        items,
        bundleItems,
        tenantName: tenant.name,
        orderType: selectedOrderTypeData,
        customerData: normalizedCustomerData,
        paymentMethod: selectedPaymentMethodData,
        formFields,
        serviceChargeAmount,
        scheduledForLabel,
        deliveryFee: validDeliveryFee,
        discounts: effectiveDiscounts,
      })

      // ── PHASE 2: Resolve Messenger URL (no request — read with the page) ──
      // The connected Facebook page's id was resolved on the server; see
      // CheckoutConfig.facebookPageId for why the browser no longer reads it.
      const handoff = resolveMessengerHandoff({
        tenant,
        facebookPageId: config.facebookPageId,
        isMessengerEnabled: messengerEnabled,
        message,
      })

      // ── Preflights ── (see findPreflightRefusal)
      const refusal = await findPreflightRefusal(tenant.id)
      if (refusal) {
        toast.error(refusal)
        setIsProcessing(false)
        return
      }
      // Stock checks may outlast a quotation. Keep the cart recoverable rather
      // than confirming a delivery whose quote expired during that request.
      if (isDeliveryBlocked()) {
        setIsProcessing(false)
        return
      }

      // ── PHASE 3: Show confirmation screen IMMEDIATELY ─────────────────────
      setCompletedOrderData(buildCompletedOrderSnapshot({
        items,
        total,
        // validDeliveryFee, not a truthiness test: free delivery (0) is a fee,
        // and the summary already billed it as one.
        deliveryFee: validDeliveryFee,
        serviceChargeAmount,
        discounts: effectiveDiscounts,
        customerData: normalizedCustomerData,
        orderTypeName: selectedOrderTypeData?.name ?? null,
        scheduledForLabel,
        paymentMethod: selectedPaymentMethodData,
        messengerMessage: message,
        messengerUrl: handoff.messengerUrl,
        formFields,
      }))

      // Set ref synchronously BEFORE clearCart to prevent race with cart-empty useEffect
      checkoutCompleteRef.current = true
      clearCart()
      // The table was for this order; the next scan names the next one.
      clearLinkedTable(window.localStorage, tenantSlug)
      setCheckoutComplete(true)
      setIsProcessing(false)
      toast.success('Order placed! 🎉')

      // ── PHASE 4: Save order to DB in background (non-blocking) ───────────
      if (tenant.enable_order_management) {
        saveOrderInBackground(tenant.id, orderType, normalizedCustomerData, handoff)
      }
    } catch (error) {
      console.error('Checkout error:', error)
      toast.error('An error occurred. Please try again.')
      setIsProcessing(false)
    }
  }

  return {
    // identity
    tenantSlug,
    router,
    branding,
    // operating-hours enforcement (designs render the closed notice)
    openStatus,
    // tenant / loading
    tenant,
    isLoading,
    isProcessing,
    // order types + selection
    orderTypes,
    orderType,
    setOrderType,
    // Whether the fulfillment section is a question at all. A sole order type
    // is already selected below, so rendering it would be a step made of an
    // answer — see lib/checkout-fulfillment-choice.
    // A presell cart forces scheduling on, and the scheduler lives inside the
    // fulfillment section — so the effective config decides, not the stored flag.
    shouldAskFulfillment: shouldAskFulfillmentMethod(orderTypes, { isSchedulingForced: advanceConfig.enabled }),
    selectedOrderTypeData,
    messengerEnabled,
    // kiosk mode (counter tablet): no Messenger, auto-return to the menu
    isKiosk,
    kioskCountdown,
    // branch (multi-branch tenants only)
    outlet,
    // customer form
    formFields,
    customerData,
    setCustomerData,
    isSmsOptedIn,
    setIsSmsOptedIn,
    // payment
    paymentMethods,
    selectedPaymentMethod,
    setSelectedPaymentMethod,
    // cart + totals
    items,
    bundleItems,
    total,
    serviceChargeAmount,
    deliveryFee,
    isDeliveryFeeWaived,
    freeDeliveryThreshold,
    freeDeliveryRemaining,
    isFetchingDeliveryFee,
    deliveryFeeAddress,
    deliveryOutOfRange,
    deliveryDistanceKm,
    deliveryFeeError,
    retryDeliveryQuote,
    validDeliveryFee,
    grandTotal,
    orderMinimum,
    // vouchers
    voucherCodes,
    voucherPreview,
    isCheckingVoucher,
    applyVoucherCode,
    removeVoucherCode,
    // advance order / scheduling
    advanceConfig,
    scheduleMode,
    setScheduleMode,
    scheduleDate,
    setScheduleDate,
    scheduleTime,
    setScheduleTime,
    scheduleDates,
    timeSlots,
    isScheduling,
    scheduledForLabel,
    isScheduleValid,
    now,
    handleScheduleDateChange,
    cartPresellDate,
    // dialogs + clipboard
    showPaymentDetails,
    setShowPaymentDetails,
    qrDialogOpen,
    setQrDialogOpen,
    selectedQrCode,
    openQrDialog,
    copiedText,
    handleCopyText,
    // payment proof
    paymentProofUrl: paymentProof.url,
    paymentProofReference: paymentProof.reference,
    setPaymentProofReference,
    handlePaymentProofUploaded,
    handleRemovePaymentProof,
    // confirmation
    checkoutComplete,
    completedOrderData,
    redirectCountdown,
    trackingOrderId,
    trackingToken,
    messageExpanded,
    // True when every retry of the order save failed. The confirmation
    // screen turns this into a persistent notice; the toast alone fades.
    orderSaveFailed,
    // The sentence to show and whether Messenger still delivers this order.
    // `null` while the save is in flight or once it succeeded.
    orderSaveNotice,
    setMessageExpanded,
    // handlers
    handleProceedToPayment,
    handleCheckout,
    handleQrHandoff,
  }
}

export type UseCheckoutReturn = ReturnType<typeof useCheckout>
