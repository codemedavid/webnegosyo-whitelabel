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
 * Load-bearing invariants preserved from the original monolith — do not change:
 *  - `checkoutCompleteRef.current = true` is set synchronously BEFORE `clearCart()`
 *    so the cart-empty redirect effect can't navigate away mid-confirmation.
 *  - The delivery quote hook invalidates a changed route before effects run
 *    and drops superseded requests. Every submit path checks its validity.
 */

import { addonLabel } from '@/lib/addon-quantity'
import { withInventorySelectionSnapshot } from '@/lib/inventory-selection-snapshot'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { generateMessengerUrl, generateMessengerMessage, generateMessengerDirectUrl, calculateCartItemUnitPrice, isCheckoutCartEmpty, getEffectiveItemPrice } from '@/lib/cart-utils'
import { isMessengerEnabledForOrderType, isMessengerRedirectEnabledForOrderType } from '@/lib/messenger-availability'
import { saveOrderDurably, isOrderSaveRetrySafe } from '@/lib/checkout/durable-order-save'
import { awaitSaveBeforeRedirect } from '@/lib/checkout/messenger-redirect-gate'
import { classifyOrderSave, type OrderSaveNotice } from '@/lib/checkout/order-save-outcome'
import { useBrandingPreviewTenant } from '@/hooks/use-branding-preview'
import { preflightPresellAction } from '@/app/actions/presell-checkout'
import { preflightCheckoutStockAction } from '@/app/actions/checkout-stock'
import { computeOrderTotals, type OrderDiscountLine } from '@/lib/order-totals'
import { checkOrderMinimum, formatOrderMinimumMessage } from '@/lib/order-minimum'
import { validateVoucherAction } from '@/app/actions/vouchers'
import { buildVoucherPreviewLines } from '@/lib/vouchers/checkout-preview-lines'
import {
  addCode,
  cartFingerprint,
  discountLinesFrom,
  isPreviewStale,
  removeCode,
  EMPTY_CHECKOUT_VOUCHER_STATE,
  type CheckoutVoucherState,
} from '@/lib/vouchers/checkout-codes'
import { useStoreOpenStatus } from '@/hooks/use-store-open-status'
import { STORE_CLOSED_MESSAGE } from '@/lib/store-open-status'
import { useCart } from '@/hooks/useCart'
import { useKioskMode } from '@/hooks/use-kiosk-mode'
import { useKioskReturn } from '@/hooks/use-kiosk-return'
import { createOrderAction } from '@/app/actions/orders'
import { useCheckoutOutlet } from '@/hooks/use-checkout-outlet'
import { shouldAskFulfillmentMethod } from '@/lib/checkout-fulfillment-choice'
import { extractSelectionIds } from '@/lib/inventory/order-item-selection'
import { flattenBundleOrderItems } from '@/lib/bundle-order-items'
import { getPaymentProofError, isPaymentProofRequired } from '@/lib/payment-proof'
import { isAfterBillingPaymentEnabled, resolvePaymentSubmitPlan } from '@/lib/after-billing-payment'
import { isPaymentDetailsStepSkipped } from '@/lib/payment-details-step'
import { resolveActiveOrderType } from '@/lib/checkout-order-type'
import { clearLinkedTable, preferDineInOrderType, readLinkedTable, seedTableField } from '@/lib/table-qr-param'
import { extractImageKitFilePath } from '@/lib/imagekit-utils'
import { trackAnalyticsEventAction } from '@/app/actions/analytics'
import { computeChecksum, QR_SIZE_WARN_THRESHOLD } from '@/lib/qr-order-codec'
import { prepareOrderQr } from '@/lib/qr-order-capacity'
import { savePendingOrder } from '@/lib/qr-pending-order'
import { resolveOrderContact } from '@/lib/customer-identity'
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
import { buildInventorySelections, buildQrOrderItems } from '@/lib/checkout/qr-order-items'
import { rememberActiveOrder } from '@/lib/checkout/active-orders-storage'
import { useDeliveryQuote } from '@/hooks/checkout/use-delivery-quote'
import { useCheckoutSchedule } from '@/hooks/checkout/use-checkout-schedule'
import { toast } from 'sonner'
import type { QrOrderPayloadV1 } from '@/types/qr-order'
import type { Tenant, CartItem } from '@/types/database'

export interface CompletedOrderData {
  items: CartItem[]
  total: number
  deliveryFee: number | null
  serviceChargeAmount: number
  /**
   * What was actually taken off this order. Carried on the snapshot because the
   * confirmation screen re-derives the grand total from these parts, and a cart
   * cleared a millisecond later can no longer be asked.
   */
  discounts: OrderDiscountLine[]
  customerData: Record<string, string>
  orderTypeName: string | null
  scheduledForLabel: string | null
  paymentMethodName: string | null
  paymentMethodDetails: string | null
  messengerMessage: string
  messengerUrl: string
  formFields: { field_name: string; field_label: string }[]
}

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

  // Payment methods linked to the chosen order type. The selection is derived:
  // a choice the new order type does not offer is dropped (an order must never
  // carry a method not linked to its order type) and a sole method preselects.
  const paymentMethods = paymentMethodsForOrderType(config, orderType)
  const [chosenPaymentMethod, setSelectedPaymentMethod] = useState<string | null>(null)
  const selectedPaymentMethod = reconcilePaymentSelection(paymentMethods, chosenPaymentMethod)
  const [qrDialogOpen, setQrDialogOpen] = useState(false)
  const [selectedQrCode, setSelectedQrCode] = useState<string | null>(null)
  const [showPaymentDetails, setShowPaymentDetails] = useState(false)
  // Payment proof (screenshot upload and/or reference number)
  const [paymentProofUrl, setPaymentProofUrl] = useState<string>('')
  const [paymentProofPublicId, setPaymentProofPublicId] = useState<string>('')
  const [paymentProofReference, setPaymentProofReference] = useState<string>('')
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
  const serviceChargeAmount = (() => {
    if (!selectedOrderTypeData?.service_charge_enabled || !selectedOrderTypeData.service_charge_value) return 0
    if (selectedOrderTypeData.service_charge_type === 'percentage') {
      return Math.round(total * (selectedOrderTypeData.service_charge_value / 100) * 100) / 100
    }
    return selectedOrderTypeData.service_charge_value
  })()

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
  // Operating-hours enforcement. A scheduled (advance) order is always allowed —
  // pre-ordering while the shop is shut is the point of the feature — so only
  // ASAP checkouts are gated.
  const openStatus = useStoreOpenStatus(tenant)

  // Delivery fee for the picked address: Lalamove quote OR distance-based fee.
  const {
    deliveryFee,
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
   * Refuse an ASAP checkout while the shop is outside its operating hours.
   * Returns true (and surfaces the reason) when the submit must be aborted.
   * Scheduled orders bypass this — see `openStatus` above.
   */
  const isOrderingClosed = (): boolean => {
    if (!openStatus.isOrderingBlocked || isScheduling) return false
    toast.error(
      openStatus.nextOpenLabel
        ? `${STORE_CLOSED_MESSAGE}. Opens ${openStatus.nextOpenLabel}.`
        : `${STORE_CLOSED_MESSAGE}.`
    )
    return true
  }

  // Derived totals shared by every design so they never recompute the fee/total rules.
  // A fee quoted against a DIFFERENT address than the one currently typed is
  // stale and must not be billed — the summary renders "—" for it, and the
  // total has to agree.
  const validDeliveryFee = (deliveryFee !== null && deliveryFeeAddress === customerData.delivery_address)
    ? deliveryFee
    : null
  // Vouchers. The preview is a rendering hint only — the server re-prices from
  // the codes at order time — so it is dropped the moment the cart moves under
  // it rather than shown stale.
  const [voucherState, setVoucherState] = useState<CheckoutVoucherState>(
    EMPTY_CHECKOUT_VOUCHER_STATE
  )
  const [isCheckingVoucher, setIsCheckingVoucher] = useState(false)

  // Bundle slots are priced by the server too, so they belong in both the
  // request and the fingerprint. Leaving them out of the fingerprint left a
  // preview looking fresh after the customer changed a bundle under it.
  const voucherPreviewLines = useMemo(
    () => buildVoucherPreviewLines(items, bundleItems),
    [items, bundleItems]
  )

  const voucherFingerprint = cartFingerprint(
    voucherPreviewLines,
    validDeliveryFee,
    serviceChargeAmount
  )

  // A stale preview contributes nothing: the summary shows full price for a
  // moment rather than a discount the server will not honour.
  const effectiveDiscounts = isPreviewStale(voucherState, voucherFingerprint)
    ? []
    : discountLinesFrom(voucherState.preview)

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

  /**
   * Re-prices whatever codes are currently entered.
   *
   * Runs on every code change and whenever the cart moves, because both change
   * what a voucher is worth. Guarded on the fingerprint captured before the
   * request so a slow reply cannot overwrite a newer cart.
   */
  // Only the newest voucher request may write its answer. Applying A then B
  // quickly used to let the slower [A] reply land last and show A's discount
  // as if it were [A, B]'s — the fingerprint only tracks the cart, not codes.
  const voucherRequestSeqRef = useRef(0)
  const tenantId = tenant?.id ?? null

  const refreshVoucherPreview = useCallback(
    async (codes: readonly string[], fingerprint: string) => {
      const requestSeq = ++voucherRequestSeqRef.current
      if (codes.length === 0) {
        setVoucherState({ codes: [], preview: null, previewFingerprint: null })
        setIsCheckingVoucher(false)
        return
      }

      if (!tenantId) return

      setIsCheckingVoucher(true)
      try {
        const result = await validateVoucherAction({
          tenantId,
          codes: [...codes],
          lines: voucherPreviewLines,
          deliveryFee: validDeliveryFee,
          serviceCharge: serviceChargeAmount,
          channel: 'checkout',
          outletId: outlet.selectedOutletId ?? null,
        })
        if (requestSeq !== voucherRequestSeqRef.current) return

        if (!result.success || !result.data) {
          toast.error(result.error ?? 'Could not check that voucher')
          return
        }

        setVoucherState((prev) => ({
          ...prev,
          preview: result.data ?? null,
          previewFingerprint: fingerprint,
        }))
      } catch (error) {
        if (requestSeq !== voucherRequestSeqRef.current) return
        console.error('[Checkout] Voucher check failed:', error)
        toast.error('Could not check that voucher. Please try again.')
      } finally {
        // A thrown request used to leave the spinner on for good.
        if (requestSeq === voucherRequestSeqRef.current) setIsCheckingVoucher(false)
      }
    },
    [tenantId, voucherPreviewLines, validDeliveryFee, serviceChargeAmount, outlet.selectedOutletId]
  )

  const applyVoucherCode = useCallback(
    async (raw: string) => {
      const next = addCode(voucherState, raw)
      if (next === voucherState) return
      setVoucherState(next)
      await refreshVoucherPreview(next.codes, voucherFingerprint)
    },
    [voucherState, refreshVoucherPreview, voucherFingerprint]
  )

  const removeVoucherCode = useCallback(
    async (raw: string) => {
      const next = removeCode(voucherState, raw)
      if (next === voucherState) return
      setVoucherState(next)
      await refreshVoucherPreview(next.codes, voucherFingerprint)
    },
    [voucherState, refreshVoucherPreview, voucherFingerprint]
  )

  // The cart moved under an applied code — re-price rather than show a
  // discount the server will not honour.
  useEffect(() => {
    if (!isPreviewStale(voucherState, voucherFingerprint)) return
    void refreshVoucherPreview(voucherState.codes, voucherFingerprint)
  }, [voucherState, voucherFingerprint, refreshVoucherPreview])

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
    }
    void openMessengerWhenSafe()

    return () => {
      isCancelled = true
      clearInterval(interval)
    }
  }, [checkoutComplete, completedOrderData?.messengerUrl, messengerRedirectEnabled])

  // QR-handoff flow: build a QrOrderPayloadV1 from the cart + form values,
  // persist it locally, and navigate to the QR thank-you page. NOTHING is
  // written to Convex or Supabase here — the vendor scanner is the sole writer.
  const handleQrHandoff = () => {
    if (!tenant || isProcessing || !orderType) return
    if (isOrderingClosed()) return
    if (isDeliveryBlocked()) return

    const selectedMethodForProof = paymentMethods.find(pm => pm.id === selectedPaymentMethod) ?? null
    const proofError = getPaymentProofError(selectedMethodForProof, {
      screenshotUrl: paymentProofUrl,
      reference: paymentProofReference,
    })
    if (proofError) {
      toast.error(proofError)
      return
    }

    setIsProcessing(true)

    try {
      // Canonicalize every form field (phone → E.164, email lowercased, text
      // whitespace-collapsed) before it is written into the QR payload so the
      // vendor scanner persists a clean customer record.
      const normalizedCustomerData = normalizeCustomerData(customerData, formFields)
      const selectedOrderType = orderTypes.find(ot => ot.id === orderType)
      const selectedPayment = paymentMethods.find(pm => pm.id === selectedPaymentMethod)

      // Cart lines + bundle slots → QR payload lines (same shape as the
      // Messenger/createOrderAction path below).
      const qrItems = buildQrOrderItems(items, bundleItems)

      // The same number the summary shows. Built separately it drifted: it
      // omitted the delivery fee entirely, so a delivery order paid by QR
      // asked for less than it billed, and it would have missed any discount.
      const grandTotalForQr = grandTotal

      const inventorySelections = buildInventorySelections(items, bundleItems)
      const qrCustomerData = withInventorySelectionSnapshot({
        ...normalizedCustomerData,
        ...(scheduledForISO ? { scheduled_for: scheduledForISO, scheduled_for_label: scheduledForLabel ?? '' } : {}),
        ...((paymentProofUrl || paymentProofReference)
          ? {
              payment_proof_url: paymentProofUrl || undefined,
              payment_proof_public_id: paymentProofPublicId || undefined,
              payment_proof_reference: paymentProofReference || undefined,
            }
          : {}),
      }, inventorySelections)

      const payload: Omit<QrOrderPayloadV1, 'ck'> = {
        v: 1,
        cid: crypto.randomUUID(),
        t: Date.now(),
        tenantId: tenant.id,
        tenantSlug,
        orderTypeId: orderType,
        orderType: selectedOrderType?.type ?? selectedOrderType?.name ?? '',
        customerName: normalizedCustomerData.customer_name || '',
        // Resolve from any phone/email field the tenant form uses (not just the
        // literal customer_phone/customer_email keys) so the stored contact is a
        // stable per-customer identity for analytics.
        customerContact: resolveOrderContact({ name: normalizedCustomerData.customer_name, customerData: normalizedCustomerData }),
        customerData: qrCustomerData,
        items: qrItems,
        total: grandTotalForQr,
        ...(selectedPayment ? { paymentMethodId: selectedPayment.id, paymentMethod: selectedPayment.name } : {}),
        ...(scheduledForISO ? { scheduledFor: scheduledForISO, ...(scheduledForLabel ? { scheduledForLabel } : {}) } : {}),
      }

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
    const selectedMethodForPlan = paymentMethods.find(pm => pm.id === selectedPaymentMethod) ?? null
    const submitPlan = resolvePaymentSubmitPlan({
      hasPaymentMethods: paymentMethods.length > 0,
      hasSelectedPaymentMethod: !!selectedPaymentMethod,
      isAfterBillingPayment: isAfterBillingPaymentEnabled(selectedOrderTypeData),
      requiresPaymentProof: isPaymentProofRequired(selectedMethodForPlan),
      isQrHandoff: !!tenant?.qr_handoff_enabled,
      skipsPaymentDetails: isPaymentDetailsStepSkipped(selectedMethodForPlan),
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

    handleCheckout()
  }

  // Best-effort delete of an ImageKit payment-proof asset (replace/remove cleanup).
  // The folder-scoped guard runs server-side on the filePath derived from the URL.
  const deleteProofAsset = (fileId: string, url: string) => {
    if (!fileId || !url) return
    const filePath = extractImageKitFilePath(url)
    if (!filePath) return
    fetch('/api/payment-proof/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId, filePath }),
    }).catch(error => console.warn('[Checkout] Proof cleanup failed:', error))
  }

  // Upload callback: delete the previously-uploaded screenshot before storing the new one.
  const handlePaymentProofUploaded = (url: string, fileId: string) => {
    if (paymentProofPublicId && paymentProofPublicId !== fileId) {
      deleteProofAsset(paymentProofPublicId, paymentProofUrl)
    }
    setPaymentProofUrl(url)
    setPaymentProofPublicId(fileId)
  }

  const handleRemovePaymentProof = () => {
    if (paymentProofPublicId) deleteProofAsset(paymentProofPublicId, paymentProofUrl)
    setPaymentProofUrl('')
    setPaymentProofPublicId('')
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

    // Only worth surfacing the message box when sending it is the recovery.
    if (notice.isMessengerRecoverable && messengerEnabled) setMessageExpanded(true)

    // Only promise Messenger to a tenant that actually has it. Naming a
    // recovery the customer cannot perform is the same defect in a new place.
    const canSendMessenger = notice.isMessengerRecoverable && messengerEnabled

    toast.error(
      canSendMessenger
        ? `${notice.message} Please send the Messenger message so they receive it.`
        : notice.message,
      { duration: 12000 }
    )
  }

  const handleCheckout = async () => {
    if (!tenant || isProcessing || !orderType) return
    if (isOrderingClosed()) return
    if (isDeliveryBlocked()) return

    // Enforce per-method payment-proof requirement (screenshot OR reference).
    // After-billing and skip-details methods still honour this: a proof-required
    // method opens the details step either way, so checkout is never blocked by
    // a UI that was skipped.
    const selectedMethodForProof = paymentMethods.find(pm => pm.id === selectedPaymentMethod) ?? null
    const proofError = getPaymentProofError(selectedMethodForProof, {
      screenshotUrl: paymentProofUrl,
      reference: paymentProofReference,
    })
    if (proofError) {
      toast.error(proofError)
      return
    }

    setIsProcessing(true)

    try {
      // Canonicalize every form field (phone → E.164, email lowercased, text
      // whitespace-collapsed) up front so the Messenger message, the confirmation
      // snapshot, and the persisted order all carry the same clean values.
      const normalizedCustomerData = normalizeCustomerData(customerData, formFields)

      // Get selected payment method details for snapshot
      const selectedPayment = paymentMethods.find(pm => pm.id === selectedPaymentMethod)

      // ── PHASE 1: Generate order message (instant, no DB) ────────────────
      const selectedOrderType = orderTypes.find(ot => ot.id === orderType)
      const orderTypeInfo = selectedOrderType ? {
        name: selectedOrderType.name,
        type: selectedOrderType.type,
      } : null

      const selectedPaymentForMessage = paymentMethods.find(pm => pm.id === selectedPaymentMethod)
      const paymentMethodInfo = selectedPaymentForMessage ? {
        name: selectedPaymentForMessage.name,
        details: selectedPaymentForMessage.details || undefined,
      } : null

      const formFieldsMeta = formFields.map(field => ({
        field_name: field.field_name,
        field_label: field.field_label,
      }))

      const message = generateMessengerMessage(
        items,
        tenant.name,
        orderTypeInfo,
        normalizedCustomerData,
        paymentMethodInfo,
        formFieldsMeta,
        serviceChargeAmount || undefined,
        scheduledForLabel || undefined,
        {
          bundleItems,
          deliveryFee: validDeliveryFee,
          discounts: effectiveDiscounts,
        }
      )

      // ── PHASE 2: Resolve Messenger URL (no request — read with the page) ──
      // The connected Facebook page's id was resolved on the server; see
      // CheckoutConfig.facebookPageId for why the browser no longer reads it.
      const pageId: string | null =
        config.facebookPageId || tenant.messenger_username || tenant.messenger_page_id || null

      const isFacebookPageConnected = tenant.facebook_page_id !== null &&
        tenant.facebook_page_id !== undefined &&
        pageId !== null &&
        (pageId !== tenant.messenger_username && pageId !== tenant.messenger_page_id)

      const useDirectMode = tenant.messenger_redirect_mode === 'direct'

      // Build Messenger URL without order ID first (we don't have it yet)
      let messengerUrl: string | null = null
      if (messengerEnabled && pageId && pageId.trim() !== '') {
        if (useDirectMode) {
          messengerUrl = generateMessengerDirectUrl(pageId)
        } else {
          messengerUrl = generateMessengerUrl(pageId, message)
        }
      }

      // ── Preflights ──
      // The confirmation screen below is optimistic, so a server refusal after
      // it would be invisible. A pre-order re-checks its dates, and every cart
      // asks whether the kitchen can make the number in it — without that an
      // uncoverable cart showed "Order Placed!" and wrote nothing. The guards
      // inside createOrderAction stay authoritative; these only move their
      // sentence somewhere visible. Independent, so they run side by side
      // rather than adding two round trips to the tap.
      const [presellVerdict, stockVerdict] = await Promise.all([
        cartPresellDate
          ? preflightPresellAction(
              tenant.id,
              items.map(item => ({ menuItemId: item.menu_item.id, quantity: item.quantity, presellDate: item.presell_date })),
            )
          : Promise.resolve({ ok: true } as const),
        preflightCheckoutStockAction(
          tenant.id,
          items.map(item => ({ menuItemId: item.menu_item.id, quantity: item.quantity })),
          outlet.selectedOutletId ?? null,
        ),
      ])
      const refusal = [presellVerdict, stockVerdict].find(verdict => !verdict.ok)
      if (refusal && !refusal.ok) {
        toast.error(refusal.message)
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
      const selectedOrderTypeName = orderTypes.find(ot => ot.id === orderType)?.name ?? null
      const selectedPaymentName = paymentMethods.find(pm => pm.id === selectedPaymentMethod)?.name ?? null
      const selectedPaymentDetails = paymentMethods.find(pm => pm.id === selectedPaymentMethod)?.details ?? null
      const formFieldsMeta2 = formFields.map(f => ({ field_name: f.field_name, field_label: f.field_label }))

      // Snapshot cart data before clearing
      const snapshotItems = [...items]
      const snapshotBundleItems = [...bundleItems]
      const snapshotTotal = total
      const snapshotDiscounts = [...effectiveDiscounts]
      const snapshotCustomerData = { ...normalizedCustomerData }

      setCompletedOrderData({
        items: snapshotItems,
        total: snapshotTotal,
        // validDeliveryFee, not a truthiness test: free delivery (0) is a fee,
        // and the summary already billed it as one.
        deliveryFee: validDeliveryFee,
        serviceChargeAmount,
        discounts: snapshotDiscounts,
        customerData: snapshotCustomerData,
        orderTypeName: selectedOrderTypeName,
        scheduledForLabel,
        paymentMethodName: selectedPaymentName,
        paymentMethodDetails: selectedPaymentDetails,
        messengerMessage: message,
        messengerUrl: messengerUrl ?? '',
        formFields: formFieldsMeta2,
      })

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
        const orderItems: Array<{
          menu_item_id: string
          menu_item_name: string
          variation?: string
          addons: string[]
          quantity: number
          price: number
          subtotal: number
          special_instructions?: string
          option_ids?: string[]
          addon_ids?: string[]
          addon_quantities?: Record<string, number>
          isUpsellItem?: boolean
          isBundleItem?: boolean
          bundleId?: string
          bundleName?: string
          slotName?: string
        }> = snapshotItems.map(item => {
          // Includes add-ons — see the QR path above; the server clamps
          // subtotal to price × quantity.
          const itemPrice = calculateCartItemUnitPrice(
            getEffectiveItemPrice(item.menu_item),
            item.selected_variations ?? item.selected_variation,
            item.selected_addons
          )

          let variationText = ''
          if (item.selected_variation) {
            variationText = item.selected_variation.name
          } else if (item.selected_variations) {
            variationText = Object.values(item.selected_variations).map(opt => opt.name).join(', ')
          }

          // The display strings above flatten the selection; these keep the
          // ids so inventory can spend what an option actually adds. Additive —
          // nothing that reads the strings is affected.
          const selection = extractSelectionIds(item)

          return {
            menu_item_id: item.menu_item.id,
            menu_item_name: item.menu_item.name,
            variation: variationText || undefined,
            addons: item.selected_addons.map(addonLabel),
            quantity: item.quantity,
            price: itemPrice,
            subtotal: item.subtotal,
            special_instructions: item.special_instructions,
            option_ids: selection.optionIds,
            addon_ids: selection.addonIds,
            ...(selection.addonQuantities ? { addon_quantities: selection.addonQuantities } : {}),
            ...(item.upsellSource ? { isUpsellItem: true } : {}),
            ...(item.presell_date ? { presell_date: item.presell_date } : {}),
          }
        })

        // Flatten bundle items into order items. Extracted to a pure helper so
        // the payload — including the option/addon ids inventory depletion
        // resolves recipes against, which this inline loop used to drop — is
        // unit-testable. See src/lib/bundle-order-items.ts.
        orderItems.push(...flattenBundleOrderItems(snapshotBundleItems))

        const customerInfo = {
          name: snapshotCustomerData.customer_name || undefined,
          contact: resolveOrderContact({ name: snapshotCustomerData.customer_name, customerData: snapshotCustomerData }) || undefined,
        }

        // Which branch is taking this order, under either timing: the splash
        // chooser's stored answer, or the one picked on this very page. Resolved
        // by useCheckoutOutlet, which returns null for the tenants who never
        // turned branches on. The server re-validates it regardless.
        const selectedOutletId = outlet.selectedOutletId ?? undefined

        // Compare against the RAW address the fee was quoted for (deliveryFeeAddress
        // is captured from the un-normalized customerData.delivery_address), so a
        // whitespace-only normalization difference never drops a valid fee.
        const validDeliveryFeeForOrder = (deliveryFee !== null && deliveryFeeAddress === customerData.delivery_address) ? deliveryFee : undefined
        const validQuotationId = (quotationId && deliveryFeeAddress === customerData.delivery_address) ? quotationId : undefined
        const validQuoteSignature = (quoteSignature && validQuotationId) ? quoteSignature : undefined

        // Stable across retries of this attempt — see clientOrderIdRef.
        if (!clientOrderIdRef.current) {
          clientOrderIdRef.current =
            typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(36).slice(2)}`
        }
        const clientOrderId = clientOrderIdRef.current

        // The confirmation screen is already on screen, so this save is the
        // only thing standing between the customer's "Order Placed!" and the
        // merchant hearing about it. It is retried where retrying is proven
        // safe, and the Messenger redirect waits on the promise below.
        setOrderSaveNotice(null)
        orderRefusedRef.current = false

        // Captured from inside the retry so the success handling below still
        // sees the server's full reply (order id, tokens) rather than just the
        // ok/failed verdict the retry helper reports.
        let saveResult: Awaited<ReturnType<typeof createOrderAction>> | null = null

        const savePromise = saveOrderDurably(
          async () => {
            const attemptResult = await createOrderAction(
              tenant.id, orderItems, customerInfo, orderType,
              withSmsConsent(
                {
                  ...snapshotCustomerData,
                  ...(messengerPsid ? { messenger_psid: messengerPsid } : {}),
                  ...(scheduledForISO ? { scheduled_for: scheduledForISO, scheduled_for_label: scheduledForLabel ?? '' } : {}),
                },
                isSmsOptedIn,
                new Date().toISOString()
              ),
              validDeliveryFeeForOrder, validQuotationId,
              selectedPaymentMethod || undefined,
              selectedPayment?.name || undefined,
              selectedPayment?.details || undefined,
              selectedPayment?.qr_code_url || undefined,
              serviceChargeAmount || undefined,
              scheduledForISO || undefined,
              (paymentProofUrl || paymentProofReference)
                ? {
                    url: paymentProofUrl || null,
                    publicId: paymentProofPublicId || null,
                    reference: paymentProofReference || null,
                  }
                : undefined,
              selectedOutletId,
              // Codes, not amounts. The server recomputes the discount from these.
              [...voucherState.codes],
              clientOrderId,
              validQuoteSignature
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
          const result = saveResult
          if (save.ok && result?.success) {
            // Track upsell conversions
            const upsellItems = snapshotItems.filter(i => i.upsellSource)
            if (upsellItems.length > 0) {
              const sourceBreakdown: Record<string, number> = {}
              let upsellRevenue = 0
              for (const ui of upsellItems) {
                const src = ui.upsellSource!
                sourceBreakdown[src] = (sourceBreakdown[src] || 0) + 1
                upsellRevenue += ui.subtotal
              }
              trackAnalyticsEventAction(tenant.id, 'upsell_converted', {
                orderId: result.data?.id, upsellItemCount: upsellItems.length,
                upsellRevenue, sources: sourceBreakdown,
                // Additive metadata only — the event name and every existing
                // key are untouched, and the key is absent (not null) for the
                // tenants who have no branches.
                ...(selectedOutletId ? { outletId: selectedOutletId } : {}),
              })
            }

            // Proactive webhook send
            if (messengerEnabled && !useDirectMode && isFacebookPageConnected && result.data?.id && result.orderToken) {
              fetch('/api/messenger/send-order-public', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  orderId: result.data.id, tenantId: tenant.id, orderToken: result.orderToken,
                }),
              }).catch(error => console.warn('[Checkout] Proactive send error:', error))
            }

            // Save tracking data for order status page
            if (result.data?.id && result.trackingToken) {
              setTrackingOrderId(result.data.id)
              setTrackingToken(result.trackingToken)
              rememberActiveOrder(window.localStorage, tenantSlug, {
                orderId: result.data.id,
                trackingToken: result.trackingToken,
                createdAt: new Date().toISOString(),
              })
            }
          } else {
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
          }
        }).catch(error => {
          // A throw carries no verdict, so it can only be read as a lost order.
          console.error('[Checkout] Order save error:', error)
          announceOrderSaveNotice(classifyOrderSave(null))
        })
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
    voucherCodes: voucherState.codes,
    voucherPreview: isPreviewStale(voucherState, voucherFingerprint)
      ? null
      : voucherState.preview,
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
    paymentProofUrl,
    paymentProofReference,
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
