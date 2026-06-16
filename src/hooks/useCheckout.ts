'use client'

/**
 * useCheckout — the shared checkout logic layer.
 *
 * ALL checkout behaviour lives here so that the visual checkout designs
 * (classic / modern / wizard / minimal / express) are pure presentation and
 * never duplicate logic. The return value is the stable API every design
 * consumes via `ReturnType<typeof useCheckout>`.
 *
 * Load-bearing invariants preserved from the original monolith — do not change:
 *  - `checkoutCompleteRef.current = true` is set synchronously BEFORE `clearCart()`
 *    so the cart-empty redirect effect can't navigate away mid-confirmation.
 *  - The delivery-fee effect re-checks `deliveryAddress === customerData.delivery_address`
 *    after the async quote returns to drop stale quotes.
 */

import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef, useMemo } from 'react'
import { generateMessengerUrl, generateMessengerMessage, generateMessengerDirectUrl } from '@/lib/cart-utils'
import { getTenantBySlugClient } from '@/lib/tenants-client'
import { getEnabledOrderTypesByTenantClient, getCustomerFormFieldsByOrderTypeClient } from '@/lib/order-types-client'
import { getPaymentMethodsByOrderTypeClient } from '@/lib/payment-methods-client'
import {
  getAdvanceOrderConfig,
  generateScheduleDates,
  generateTimeSlots,
  getFirstAvailableSlot,
  combineDateAndTime,
  isValidScheduledTime,
  formatScheduledFor,
} from '@/lib/advance-order-utils'
import { normalizeOperatingHours } from '@/lib/operating-hours'
import { useCart } from '@/hooks/useCart'
import { createOrderAction } from '@/app/actions/orders'
import { getPaymentProofError } from '@/lib/payment-proof'
import { trackAnalyticsEventAction } from '@/app/actions/analytics'
import { createQuotationAction } from '@/app/actions/lalamove'
import { calculateDistanceDeliveryFeeAction } from '@/app/actions/delivery'
import { createClient } from '@/lib/supabase/client'
import { encodeOrderToQr, computeChecksum, QR_SIZE_WARN_THRESHOLD } from '@/lib/qr-order-codec'
import { savePendingOrder } from '@/lib/qr-pending-order'
import { getTenantBranding } from '@/lib/branding-utils'
import { toast } from 'sonner'
import type { QrOrderItemV1, QrOrderPayloadV1 } from '@/types/qr-order'
import type { Tenant, OrderType, CustomerFormField, PaymentMethod, CartItem } from '@/types/database'

export interface CompletedOrderData {
  items: CartItem[]
  total: number
  deliveryFee: number | null
  serviceChargeAmount: number
  customerData: Record<string, string>
  orderTypeName: string | null
  scheduledForLabel: string | null
  paymentMethodName: string | null
  paymentMethodDetails: string | null
  messengerMessage: string
  messengerUrl: string
  formFields: { field_name: string; field_label: string }[]
}

export function useCheckout(tenantSlug: string) {
  const router = useRouter()
  const { items, bundleItems, total, clearCart, orderType, setOrderType, messengerPsid } = useCart()

  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [orderTypes, setOrderTypes] = useState<OrderType[]>([])
  const [formFields, setFormFields] = useState<CustomerFormField[]>([])
  const [customerData, setCustomerData] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [checkoutComplete, setCheckoutComplete] = useState(false)
  const checkoutCompleteRef = useRef(false) // Sync ref to prevent race with cart empty useEffect
  const [completedOrderData, setCompletedOrderData] = useState<CompletedOrderData | null>(null)
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null)
  const [trackingToken, setTrackingToken] = useState<string | null>(null)

  // Delivery fee state (Lalamove quotation OR distance-based; Lalamove takes precedence)
  const [deliveryFee, setDeliveryFee] = useState<number | null>(null)
  const [quotationId, setQuotationId] = useState<string | null>(null)
  const [isFetchingDeliveryFee, setIsFetchingDeliveryFee] = useState(false)
  const [deliveryFeeAddress, setDeliveryFeeAddress] = useState<string>('') // Track which address the fee is for
  // Distance-based delivery: address is outside the configured radius (blocks delivery submit)
  const [deliveryOutOfRange, setDeliveryOutOfRange] = useState(false)
  const [deliveryDistanceKm, setDeliveryDistanceKm] = useState<number | null>(null)

  // Payment method state
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string | null>(null)
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

  // Advance order (scheduling) state
  const [scheduleMode, setScheduleMode] = useState<'asap' | 'scheduled'>('asap')
  const [scheduleDate, setScheduleDate] = useState<string>('') // YYYY-MM-DD (local)
  const [scheduleTime, setScheduleTime] = useState<string>('') // HH:MM (24h, local)
  // `now` drives slot availability; refreshed each minute so the cutoff stays accurate.
  const [now, setNow] = useState<Date>(() => new Date())

  const branding = useMemo(() => getTenantBranding(tenant), [tenant])

  // Copy to clipboard helper function
  const handleCopyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedText(text)
      toast.success(`${label} copied to clipboard`)
      // Reset copied state after 2 seconds
      setTimeout(() => setCopiedText(null), 2000)
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
  const serviceChargeAmount = (() => {
    if (!selectedOrderTypeData?.service_charge_enabled || !selectedOrderTypeData.service_charge_value) return 0
    if (selectedOrderTypeData.service_charge_type === 'percentage') {
      return Math.round(total * (selectedOrderTypeData.service_charge_value / 100) * 100) / 100
    }
    return selectedOrderTypeData.service_charge_value
  })()

  // Advance order configuration + derived scheduling values for the selected order type.
  // Only surface dates that still have at least one selectable slot (a too-late "today"
  // or a day fully inside the lead window is dropped).
  const advanceConfig = getAdvanceOrderConfig(selectedOrderTypeData)
  // Operating hours bound the selectable slot window per weekday (closed days are dropped).
  const operatingHours = useMemo(
    () => normalizeOperatingHours(tenant?.operating_hours ?? null),
    [tenant?.operating_hours],
  )
  const scheduleDates = advanceConfig.enabled
    ? generateScheduleDates(advanceConfig, now, operatingHours).filter(d => generateTimeSlots(advanceConfig, d.value, now, operatingHours).length > 0)
    : []
  const timeSlots = advanceConfig.enabled && scheduleDate
    ? generateTimeSlots(advanceConfig, scheduleDate, now, operatingHours)
    : []
  const isScheduling = advanceConfig.enabled && scheduleMode === 'scheduled'
  const scheduledDateObj = isScheduling && scheduleDate && scheduleTime
    ? combineDateAndTime(scheduleDate, scheduleTime)
    : null
  const scheduledForISO = scheduledDateObj ? scheduledDateObj.toISOString() : null
  const scheduledForLabel = scheduledDateObj ? formatScheduledFor(scheduledDateObj) : null
  const isScheduleValid = scheduledDateObj ? isValidScheduledTime(advanceConfig, scheduledDateObj, now, operatingHours) : true

  // Derived totals shared by every design so they never recompute the fee/total rules.
  const validDeliveryFee = (deliveryFee !== null && deliveryFeeAddress === customerData.delivery_address)
    ? deliveryFee
    : null
  const grandTotal = total + (validDeliveryFee ?? 0) + serviceChargeAmount

  // Convenience: change the scheduled date and snap the time to the first valid slot.
  const handleScheduleDateChange = (date: string) => {
    setScheduleDate(date)
    const slots = generateTimeSlots(advanceConfig, date, now, operatingHours)
    setScheduleTime(slots[0]?.value ?? '')
  }

  // Ref to track loading state and prevent duplicate fetches
  const isLoadingRef = useRef(false)
  // Ref to track if we've initialized the default order type
  const hasInitializedOrderType = useRef(false)

  // Load all checkout data: tenant → order types → form fields + payment methods
  // Consolidated into one effect to eliminate waterfall from separate render cycles
  useEffect(() => {
    if (isLoadingRef.current) return
    isLoadingRef.current = true

    let isCancelled = false

    const loadAllData = async () => {
      try {
        const { data, error: fetchError } = await getTenantBySlugClient(tenantSlug)
        if (isCancelled) return
        if (fetchError || !data) {
          toast.error('Restaurant not found')
          router.push('/')
          return
        }
        setTenant(data)

        const enabledOrderTypes = await getEnabledOrderTypesByTenantClient(data.id)
        if (isCancelled) return
        setOrderTypes(enabledOrderTypes)

        // Determine the active order type for form fields fetch
        let activeOrderType = orderType
        if (!hasInitializedOrderType.current && enabledOrderTypes.length > 0) {
          if (!orderType) {
            activeOrderType = enabledOrderTypes[0].id
            setOrderType(enabledOrderTypes[0].id)
          }
          hasInitializedOrderType.current = true
        }

        // Immediately fetch form fields + payment methods (no waiting for re-render)
        if (activeOrderType) {
          const [fieldsResult, methodsResult] = await Promise.allSettled([
            getCustomerFormFieldsByOrderTypeClient(activeOrderType, data.id),
            getPaymentMethodsByOrderTypeClient(activeOrderType, data.id)
          ])

          if (isCancelled) return

          if (fieldsResult.status === 'fulfilled') {
            const fields = fieldsResult.value
            setFormFields(fields)
            const initialData: Record<string, string> = {}
            fields.forEach(field => { initialData[field.field_name] = '' })
            setCustomerData(initialData)
          } else {
            console.error('Failed to load form fields:', fieldsResult.reason)
            toast.error('Failed to load form fields')
          }

          if (methodsResult.status === 'fulfilled') {
            const methods = methodsResult.value || []
            setPaymentMethods(methods)
            if (methods.length === 1) {
              setSelectedPaymentMethod(methods[0].id)
            } else {
              setSelectedPaymentMethod(null)
            }
          } else {
            setPaymentMethods([])
            setSelectedPaymentMethod(null)
          }
        }
      } catch {
        if (isCancelled) return
        toast.error('Failed to load restaurant')
        router.push('/')
      } finally {
        setIsLoading(false)
        isLoadingRef.current = false
      }
    }

    loadAllData()

    return () => {
      isCancelled = true
      isLoadingRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantSlug, router, setOrderType])

  // Reload form fields and payment methods when order type changes (after initial load)
  useEffect(() => {
    // Skip during initial load — the consolidated effect handles it
    if (isLoading || !tenant || !orderType) return

    let isCancelled = false

    const loadFormFields = async () => {
      try {
        const [fieldsResult, methodsResult] = await Promise.allSettled([
          getCustomerFormFieldsByOrderTypeClient(orderType, tenant.id),
          getPaymentMethodsByOrderTypeClient(orderType, tenant.id)
        ])

        if (isCancelled) return

        if (fieldsResult.status === 'fulfilled') {
          const fields = fieldsResult.value
          setFormFields(fields)
          const initialData: Record<string, string> = {}
          fields.forEach(field => { initialData[field.field_name] = '' })
          setCustomerData(initialData)
        } else {
          console.error('Failed to load form fields:', fieldsResult.reason)
          toast.error('Failed to load form fields')
        }

        if (methodsResult.status === 'fulfilled') {
          const methods = methodsResult.value || []
          setPaymentMethods(methods)
          if (methods.length === 1) {
            setSelectedPaymentMethod(methods[0].id)
          } else {
            setSelectedPaymentMethod(null)
          }
        } else {
          setPaymentMethods([])
          setSelectedPaymentMethod(null)
        }
      } catch (error) {
        if (isCancelled) return
        console.error('Failed to load form fields:', error)
        toast.error('Failed to load form fields')
      }
    }

    loadFormFields()

    return () => { isCancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderType])

  // Redirect to menu if cart is empty
  // Don't redirect if checkout is in progress or has completed (prevents race condition with Messenger redirect)
  useEffect(() => {
    if (!isLoading && !isProcessing && !checkoutComplete && !checkoutCompleteRef.current && items.length === 0) {
      router.push(`/${tenantSlug}/menu`)
    }
  }, [items.length, router, tenantSlug, isLoading, isProcessing, checkoutComplete])

  // Countdown timer: redirect to Messenger after 3 seconds, auto-expand message if no URL
  useEffect(() => {
    if (!checkoutComplete) return
    if (!completedOrderData?.messengerUrl) {
      setMessageExpanded(true)
      return
    }
    // Start 3-second countdown
    setRedirectCountdown(3)
    const interval = setInterval(() => {
      setRedirectCountdown(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(interval)
          // Open Messenger in new tab when countdown reaches 0
          window.open(completedOrderData.messengerUrl, '_blank', 'noopener,noreferrer')
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [checkoutComplete, completedOrderData?.messengerUrl])

  // Fetch the delivery fee when a delivery address is entered.
  // Two mutually-exclusive sources: Lalamove (when enabled — always wins) or the
  // distance-based fee (when Lalamove is off and distance delivery is configured).
  useEffect(() => {
    let isCancelled = false // Prevent race conditions

    // Reset all delivery-fee state to "no fee".
    const resetDeliveryState = () => {
      setDeliveryFee(null)
      setQuotationId(null)
      setDeliveryFeeAddress('')
      setDeliveryOutOfRange(false)
      setDeliveryDistanceKm(null)
      setIsFetchingDeliveryFee(false)
    }

    const fetchDeliveryQuote = async () => {
      const selectedOrderType = orderTypes.find(ot => ot.id === orderType)
      const isDeliveryOrder = selectedOrderType?.type === 'delivery'

      // Store location must be configured for either fee source.
      const hasRestaurantLocation = !!tenant?.restaurant_latitude && !!tenant?.restaurant_longitude

      // Lalamove takes precedence; distance-based only applies when Lalamove is off.
      const lalamoveOn = !!tenant?.lalamove_enabled
      const distanceOn = !lalamoveOn && !!tenant?.distance_delivery_enabled

      const deliveryAddress = customerData.delivery_address
      const deliveryLat = customerData.delivery_lat
      const deliveryLng = customerData.delivery_lng

      if (!isDeliveryOrder || (!lalamoveOn && !distanceOn) || !hasRestaurantLocation) {
        resetDeliveryState()
        return
      }

      if (!deliveryAddress || !deliveryLat || !deliveryLng) {
        // Delivery address not yet selected from suggestions
        resetDeliveryState()
        return
      }

      // IMMEDIATELY clear old delivery state to prevent showing stale data
      setDeliveryFee(null)
      setQuotationId(null)
      setDeliveryFeeAddress('')
      setDeliveryOutOfRange(false)
      setDeliveryDistanceKm(null)
      setIsFetchingDeliveryFee(true)

      try {
        if (lalamoveOn) {
          const result = await createQuotationAction(
            tenant!.id,
            tenant!.restaurant_address || '',
            tenant!.restaurant_latitude!,
            tenant!.restaurant_longitude!,
            deliveryAddress,
            parseFloat(deliveryLat),
            parseFloat(deliveryLng)
          )
          if (isCancelled) return
          if (result.success && result.data) {
            if (deliveryAddress === customerData.delivery_address) {
              setDeliveryFee(result.data.price)
              setQuotationId(result.data.quotationId)
              setDeliveryFeeAddress(deliveryAddress)
            }
          } else {
            console.error('Failed to fetch delivery quote:', result.error)
            toast.error(result.error || 'Failed to get delivery fee')
            setDeliveryFee(null)
            setQuotationId(null)
            setDeliveryFeeAddress('')
          }
        } else {
          // Distance-based fee
          const result = await calculateDistanceDeliveryFeeAction(
            tenant!.id,
            parseFloat(deliveryLat),
            parseFloat(deliveryLng)
          )
          if (isCancelled) return
          if (result.success && result.data) {
            // Guard against stale responses for a previous address
            if (deliveryAddress === customerData.delivery_address) {
              setDeliveryDistanceKm(result.data.distanceKm)
              if (result.data.withinRadius) {
                setDeliveryFee(result.data.fee)
                setDeliveryFeeAddress(deliveryAddress)
                setDeliveryOutOfRange(false)
              } else {
                setDeliveryFee(null)
                setDeliveryFeeAddress('')
                setDeliveryOutOfRange(true)
                toast.error(`This address is outside the delivery area (${result.data.radiusKm} km).`)
              }
            }
          } else {
            console.error('Failed to calculate delivery fee:', result.error)
            toast.error(result.error || 'Failed to get delivery fee')
            setDeliveryFee(null)
            setDeliveryFeeAddress('')
            setDeliveryOutOfRange(false)
          }
        }
      } catch (error) {
        if (isCancelled) return
        console.error('Error fetching delivery fee:', error)
        toast.error('Failed to calculate delivery fee')
        setDeliveryFee(null)
        setQuotationId(null)
        setDeliveryFeeAddress('')
        setDeliveryOutOfRange(false)
      } finally {
        if (!isCancelled) {
          setIsFetchingDeliveryFee(false)
        }
      }
    }

    fetchDeliveryQuote()

    // Cleanup function to cancel pending requests
    return () => {
      isCancelled = true
    }
  }, [tenant, orderTypes, orderType, customerData.delivery_address, customerData.delivery_lat, customerData.delivery_lng])

  // Advance order: refresh "now" each minute so the lead-time cutoff stays accurate
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  // Advance order: default the "When?" choice whenever the selected order type changes.
  // Schedule-only types (ASAP disabled) start in scheduled mode; others default to ASAP.
  useEffect(() => {
    if (!advanceConfig.enabled) {
      setScheduleMode('asap')
      return
    }
    setScheduleMode(advanceConfig.allowAsap ? 'asap' : 'scheduled')
  }, [orderType, advanceConfig.enabled, advanceConfig.allowAsap])

  // Advance order: seed a sensible default slot on entering scheduled mode, and keep the
  // selection valid as time passes or the order type changes. Re-seeds when the chosen date
  // is missing, has gone stale (e.g. crossed midnight), or falls outside the order type's
  // (possibly shrunk) horizon; otherwise just snaps the time to a valid slot for that date.
  useEffect(() => {
    if (!advanceConfig.enabled || scheduleMode !== 'scheduled') return
    const dates = generateScheduleDates(advanceConfig, now, operatingHours)
    const dateValid = !!scheduleDate && dates.some(d => d.value === scheduleDate)
    const slots = dateValid ? generateTimeSlots(advanceConfig, scheduleDate, now, operatingHours) : []
    if (!dateValid || slots.length === 0) {
      const first = getFirstAvailableSlot(advanceConfig, now, operatingHours)
      setScheduleDate(first?.dateValue ?? '')
      setScheduleTime(first?.timeValue ?? '')
      return
    }
    if (!scheduleTime || !slots.some(s => s.value === scheduleTime)) {
      setScheduleTime(slots[0].value)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    scheduleMode,
    scheduleDate,
    advanceConfig.enabled,
    advanceConfig.maxDaysAhead,
    advanceConfig.leadTimeMinutes,
    advanceConfig.slotIntervalMinutes,
    operatingHours,
    now,
  ])

  // QR-handoff flow: build a QrOrderPayloadV1 from the cart + form values,
  // persist it locally, and navigate to the QR thank-you page. NOTHING is
  // written to Convex or Supabase here — the vendor scanner is the sole writer.
  const handleQrHandoff = () => {
    if (!tenant || isProcessing || !orderType) return

    setIsProcessing(true)

    try {
      const selectedOrderType = orderTypes.find(ot => ot.id === orderType)
      const selectedPayment = paymentMethods.find(pm => pm.id === selectedPaymentMethod)

      // Map cart items to QrOrderItemV1 — mirrors the OrderItem construction
      // used in the Messenger/createOrderAction path below.
      const qrItems: QrOrderItemV1[] = items.map(item => {
        let itemPrice = item.menu_item.price
        if (item.selected_variation) {
          itemPrice += item.selected_variation.price_modifier
        }
        if (item.selected_variations) {
          itemPrice += Object.values(item.selected_variations).reduce(
            (sum, option) => sum + option.price_modifier, 0
          )
        }

        const variationSelections: QrOrderItemV1['variationSelections'] = []
        let variationText = ''
        if (item.selected_variation) {
          variationText = item.selected_variation.name
          variationSelections.push({
            typeName: 'Variation',
            optionName: item.selected_variation.name,
            priceAdjustment: item.selected_variation.price_modifier,
          })
        } else if (item.selected_variations) {
          const opts = Object.values(item.selected_variations)
          variationText = opts.map(opt => opt.name).join(', ')
          for (const opt of opts) {
            variationSelections.push({
              typeName: 'Variation',
              optionName: opt.name,
              priceAdjustment: opt.price_modifier,
            })
          }
        }

        return {
          menuItemId: item.menu_item.id,
          menuItemName: item.menu_item.name,
          quantity: item.quantity,
          price: itemPrice,
          subtotal: item.subtotal,
          ...(variationSelections.length > 0 ? { variationSelections } : {}),
          ...(variationText ? { variation: variationText } : {}),
          ...(item.selected_addons.length > 0
            ? { addons: item.selected_addons.map(a => ({ name: a.name, price: a.price })) }
            : {}),
          ...(item.special_instructions ? { specialInstructions: item.special_instructions } : {}),
          ...(item.upsellSource ? { isUpsellItem: true } : {}),
        }
      })

      // Flatten bundle items into QR items (same shape as the Messenger path).
      for (const bundle of bundleItems) {
        for (const slot of bundle.slots) {
          let slotPrice = slot.priceOverride
          let variationText = ''
          const variationSelections: QrOrderItemV1['variationSelections'] = []

          if (slot.selectedVariation) {
            slotPrice += slot.selectedVariation.price_modifier
            variationText = slot.selectedVariation.name
            variationSelections.push({
              typeName: 'Variation',
              optionName: slot.selectedVariation.name,
              priceAdjustment: slot.selectedVariation.price_modifier,
            })
          } else if (slot.selectedVariations) {
            const opts = Object.values(slot.selectedVariations)
            slotPrice += opts.reduce((sum, option) => sum + option.price_modifier, 0)
            variationText = opts.map(opt => opt.name).join(', ')
            for (const opt of opts) {
              variationSelections.push({
                typeName: 'Variation',
                optionName: opt.name,
                priceAdjustment: opt.price_modifier,
              })
            }
          }

          const addonTotal = slot.selectedAddons.reduce((sum, a) => sum + a.price, 0)
          const quantity = slot.quantity * bundle.quantity
          const itemTotal = (slotPrice + addonTotal) * quantity

          qrItems.push({
            menuItemId: slot.menuItemId,
            menuItemName: slot.menuItemName,
            quantity,
            price: slotPrice + addonTotal,
            subtotal: itemTotal,
            ...(variationSelections.length > 0 ? { variationSelections } : {}),
            ...(variationText ? { variation: variationText } : {}),
            ...(slot.selectedAddons.length > 0
              ? { addons: slot.selectedAddons.map(a => ({ name: a.name, price: a.price })) }
              : {}),
            isBundleItem: true,
            bundleId: bundle.bundleId,
            bundleName: bundle.bundleName,
            slotName: slot.slotName,
          })
        }
      }

      const grandTotalForQr = total + serviceChargeAmount

      const payload: Omit<QrOrderPayloadV1, 'ck'> = {
        v: 1,
        cid: crypto.randomUUID(),
        t: Date.now(),
        tenantId: tenant.id,
        tenantSlug,
        orderTypeId: orderType,
        orderType: selectedOrderType?.type ?? selectedOrderType?.name ?? '',
        customerName: customerData.customer_name || '',
        customerContact: customerData.customer_phone || customerData.customer_email || '',
        customerData: {
          ...customerData,
          ...(scheduledForISO ? { scheduled_for: scheduledForISO, scheduled_for_label: scheduledForLabel ?? '' } : {}),
        },
        items: qrItems,
        total: grandTotalForQr,
        ...(selectedPayment ? { paymentMethodId: selectedPayment.id, paymentMethod: selectedPayment.name } : {}),
        ...(scheduledForISO ? { scheduledFor: scheduledForISO, ...(scheduledForLabel ? { scheduledForLabel } : {}) } : {}),
      }

      const qrString = encodeOrderToQr(payload)
      if (qrString.length > QR_SIZE_WARN_THRESHOLD) {
        console.warn(
          `[Checkout] QR payload length ${qrString.length} exceeds warning threshold ${QR_SIZE_WARN_THRESHOLD}; QR may be hard to scan.`
        )
      }

      const fullPayload: QrOrderPayloadV1 = { ...payload, ck: computeChecksum(payload) }

      savePendingOrder(tenantSlug, {
        payload: fullPayload,
        qrString,
        createdAt: payload.t,
        lastStatus: 'pending',
      })

      // Set ref synchronously BEFORE clearCart to prevent race with cart-empty useEffect
      checkoutCompleteRef.current = true
      clearCart()
      toast.success('Order ready! Show the QR to the vendor.')
      router.push(`/${tenantSlug}/order/qr/${payload.cid}`)
    } catch (error) {
      console.error('QR handoff error:', error)
      toast.error('Failed to generate order QR. Please try again.')
      setIsProcessing(false)
    }
  }

  const handleProceedToPayment = () => {
    // Validate required fields
    const requiredFields = formFields.filter(field => field.is_required)
    const missingFields = requiredFields.filter(field => !customerData[field.field_name]?.trim())

    if (missingFields.length > 0) {
      toast.error(`Please fill in required fields: ${missingFields.map(f => f.field_label).join(', ')}`)
      return
    }

    // Distance-based delivery: block submit when the chosen address is outside the radius.
    if (selectedOrderTypeData?.type === 'delivery' && deliveryOutOfRange) {
      toast.error('This address is outside the delivery area. Please choose a closer address or switch to pickup.')
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

    // QR-handoff: skip both the Messenger flow and createOrderAction entirely.
    // The vendor scanner writes the order; the customer just shows a QR.
    if (tenant?.qr_handoff_enabled) {
      handleQrHandoff()
      return
    }

    // Validate payment method selection (only if payment methods are configured)
    if (paymentMethods.length > 0 && !selectedPaymentMethod) {
      toast.error('Please select a payment method before proceeding')
      // Scroll to payment methods section
      const paymentSection = document.querySelector('[data-payment-methods]')
      if (paymentSection) {
        paymentSection.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      return
    }

    // If payment methods are configured, show payment details page
    if (paymentMethods.length > 0 && selectedPaymentMethod) {
      setShowPaymentDetails(true)
      return
    }

    // Otherwise proceed directly to messenger
    handleCheckout()
  }

  // Best-effort delete of a Cloudinary payment-proof asset (replace/remove cleanup).
  const deleteProofAsset = (publicId: string) => {
    if (!publicId) return
    fetch('/api/payment-proof/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicId }),
    }).catch(error => console.warn('[Checkout] Proof cleanup failed:', error))
  }

  // Upload callback: delete the previously-uploaded screenshot before storing the new one.
  const handlePaymentProofUploaded = (url: string, publicId: string) => {
    if (paymentProofPublicId && paymentProofPublicId !== publicId) {
      deleteProofAsset(paymentProofPublicId)
    }
    setPaymentProofUrl(url)
    setPaymentProofPublicId(publicId)
  }

  const handleRemovePaymentProof = () => {
    if (paymentProofPublicId) deleteProofAsset(paymentProofPublicId)
    setPaymentProofUrl('')
    setPaymentProofPublicId('')
  }

  const handleCheckout = async () => {
    if (!tenant || isProcessing || !orderType) return

    // Enforce per-method payment-proof requirement (screenshot OR reference).
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
        customerData,
        paymentMethodInfo,
        formFieldsMeta,
        serviceChargeAmount || undefined,
        scheduledForLabel || undefined
      )

      // ── PHASE 2: Resolve Messenger URL (fast — uses cached tenant data) ──
      let pageId: string | null = tenant.messenger_username || tenant.messenger_page_id || null

      if (tenant.facebook_page_id) {
        try {
          const supabase = createClient()
          const { data: facebookPage, error: pageError } = await supabase
            .from('facebook_pages')
            .select('page_id')
            .eq('id', tenant.facebook_page_id)
            .eq('is_active', true)
            .single()

          if (!pageError && facebookPage) {
            const page = facebookPage as { page_id: string }
            if (page.page_id) pageId = page.page_id
          }
        } catch (error) {
          console.error('Error fetching Facebook page:', error)
        }
      }

      const isFacebookPageConnected = tenant.facebook_page_id !== null &&
        tenant.facebook_page_id !== undefined &&
        pageId !== null &&
        (pageId !== tenant.messenger_username && pageId !== tenant.messenger_page_id)

      const useDirectMode = tenant.messenger_redirect_mode === 'direct'

      // Build Messenger URL without order ID first (we don't have it yet)
      let messengerUrl: string | null = null
      if (pageId && pageId.trim() !== '') {
        if (useDirectMode) {
          messengerUrl = generateMessengerDirectUrl(pageId)
        } else {
          messengerUrl = generateMessengerUrl(pageId, message)
        }
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
      const snapshotCustomerData = { ...customerData }

      setCompletedOrderData({
        items: snapshotItems,
        total: snapshotTotal,
        deliveryFee: (deliveryFee && deliveryFeeAddress === customerData.delivery_address) ? deliveryFee : null,
        serviceChargeAmount,
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
          isUpsellItem?: boolean
          isBundleItem?: boolean
          bundleId?: string
          bundleName?: string
          slotName?: string
        }> = snapshotItems.map(item => {
          let itemPrice = item.menu_item.price
          if (item.selected_variation) {
            itemPrice += item.selected_variation.price_modifier
          }
          if (item.selected_variations) {
            const modifierSum = Object.values(item.selected_variations).reduce(
              (sum, option) => sum + option.price_modifier, 0
            )
            itemPrice += modifierSum
          }

          let variationText = ''
          if (item.selected_variation) {
            variationText = item.selected_variation.name
          } else if (item.selected_variations) {
            variationText = Object.values(item.selected_variations).map(opt => opt.name).join(', ')
          }

          return {
            menu_item_id: item.menu_item.id,
            menu_item_name: item.menu_item.name,
            variation: variationText || undefined,
            addons: item.selected_addons.map(a => a.name),
            quantity: item.quantity,
            price: itemPrice,
            subtotal: item.subtotal,
            special_instructions: item.special_instructions,
            ...(item.upsellSource ? { isUpsellItem: true } : {}),
          }
        })

        // Flatten bundle items into order items
        for (const bundle of snapshotBundleItems) {
          for (const slot of bundle.slots) {
            let slotPrice = slot.priceOverride
            let variationText = ''

            if (slot.selectedVariation) {
              slotPrice += slot.selectedVariation.price_modifier
              variationText = slot.selectedVariation.name
            } else if (slot.selectedVariations) {
              const modifierSum = Object.values(slot.selectedVariations).reduce(
                (sum, option) => sum + option.price_modifier, 0
              )
              slotPrice += modifierSum
              variationText = Object.values(slot.selectedVariations).map(opt => opt.name).join(', ')
            }

            const addonTotal = slot.selectedAddons.reduce((sum, a) => sum + a.price, 0)
            const itemTotal = (slotPrice + addonTotal) * slot.quantity * bundle.quantity

            orderItems.push({
              menu_item_id: slot.menuItemId,
              menu_item_name: slot.menuItemName,
              variation: variationText || undefined,
              addons: slot.selectedAddons.map(a => a.name),
              quantity: slot.quantity * bundle.quantity,
              price: slotPrice + addonTotal,
              subtotal: itemTotal,
              special_instructions: undefined,
              isBundleItem: true,
              bundleId: bundle.bundleId,
              bundleName: bundle.bundleName,
              slotName: slot.slotName,
            })
          }
        }

        const customerInfo = {
          name: snapshotCustomerData.customer_name || undefined,
          contact: snapshotCustomerData.customer_phone || snapshotCustomerData.customer_email || undefined,
        }

        const validDeliveryFeeForOrder = (deliveryFee && deliveryFeeAddress === snapshotCustomerData.delivery_address) ? deliveryFee : undefined
        const validQuotationId = (quotationId && deliveryFeeAddress === snapshotCustomerData.delivery_address) ? quotationId : undefined

        // Fire-and-forget: save order + send proactive webhook
        createOrderAction(
          tenant.id, orderItems, customerInfo, orderType,
          {
            ...snapshotCustomerData,
            ...(messengerPsid ? { messenger_psid: messengerPsid } : {}),
            ...(scheduledForISO ? { scheduled_for: scheduledForISO, scheduled_for_label: scheduledForLabel ?? '' } : {}),
          },
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
            : undefined
        ).then(result => {
          if (result.success) {
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
              })
            }

            // Proactive webhook send
            if (!useDirectMode && isFacebookPageConnected && result.data?.id && result.orderToken) {
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
              try {
                const storageKey = `active_orders_${tenantSlug}`
                const existing = JSON.parse(localStorage.getItem(storageKey) || '[]')
                if (!existing.some((o: { orderId: string }) => o.orderId === result.data!.id)) {
                  existing.push({
                    orderId: result.data.id,
                    trackingToken: result.trackingToken,
                    createdAt: new Date().toISOString(),
                  })
                  localStorage.setItem(storageKey, JSON.stringify(existing))
                }
              } catch { /* ignore localStorage errors */ }
            }
          } else {
            console.warn('[Checkout] Background order save failed:', result.error)
          }
        }).catch(error => {
          console.warn('[Checkout] Background order save error:', error)
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
    // tenant / loading
    tenant,
    isLoading,
    isProcessing,
    // order types + selection
    orderTypes,
    orderType,
    setOrderType,
    selectedOrderTypeData,
    // customer form
    formFields,
    customerData,
    setCustomerData,
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
    validDeliveryFee,
    grandTotal,
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
    setMessageExpanded,
    // handlers
    handleProceedToPayment,
    handleCheckout,
    handleQrHandoff,
  }
}

export type UseCheckoutReturn = ReturnType<typeof useCheckout>
