'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import { ArrowLeft, MessageCircle, UtensilsCrossed, Package, Truck, CreditCard, QrCode, Copy, Check, CheckCircle2, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useCart } from '@/hooks/useCart'
import { formatPrice, generateMessengerUrl, generateMessengerMessage, generateMessengerCombinedUrl, generateMessengerDirectUrl } from '@/lib/cart-utils'
import { getTenantBySlugClient } from '@/lib/tenants-client'
import { getEnabledOrderTypesByTenantClient, getCustomerFormFieldsByOrderTypeClient } from '@/lib/order-types-client'
import { getPaymentMethodsByOrderTypeClient } from '@/lib/payment-methods-client'
import { createOrderAction } from '@/app/actions/orders'
import { trackAnalyticsEventAction } from '@/app/actions/analytics'
import { createQuotationAction } from '@/app/actions/lalamove'
import { MapboxAddressAutocomplete } from '@/components/shared/mapbox-address-autocomplete'
import { toast } from 'sonner'
import type { Tenant, OrderType, CustomerFormField, PaymentMethod, CartItem } from '@/types/database'

interface CompletedOrderData {
  items: CartItem[]
  total: number
  deliveryFee: number | null
  serviceChargeAmount: number
  customerData: Record<string, string>
  orderTypeName: string | null
  paymentMethodName: string | null
  paymentMethodDetails: string | null
  messengerMessage: string
  messengerUrl: string
  formFields: { field_name: string; field_label: string }[]
}

export default function CheckoutPage() {
  const params = useParams()
  const router = useRouter()
  const tenantSlug = params.tenant as string
  const { items, total, clearCart, orderType, setOrderType, messengerPsid } = useCart()

  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [orderTypes, setOrderTypes] = useState<OrderType[]>([])
  const [formFields, setFormFields] = useState<CustomerFormField[]>([])
  const [customerData, setCustomerData] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [checkoutComplete, setCheckoutComplete] = useState(false)
  const checkoutCompleteRef = useRef(false) // Sync ref to prevent race with cart empty useEffect
  const [completedOrderData, setCompletedOrderData] = useState<CompletedOrderData | null>(null)

  // Lalamove delivery fee state
  const [deliveryFee, setDeliveryFee] = useState<number | null>(null)
  const [quotationId, setQuotationId] = useState<string | null>(null)
  const [isFetchingDeliveryFee, setIsFetchingDeliveryFee] = useState(false)
  const [deliveryFeeAddress, setDeliveryFeeAddress] = useState<string>('') // Track which address the fee is for

  // Payment method state
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string | null>(null)
  const [qrDialogOpen, setQrDialogOpen] = useState(false)
  const [selectedQrCode, setSelectedQrCode] = useState<string | null>(null)
  const [showPaymentDetails, setShowPaymentDetails] = useState(false)
  const [copiedText, setCopiedText] = useState<string | null>(null)
  const [messageExpanded, setMessageExpanded] = useState(false)

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

  // Compute service charge from selected order type
  const selectedOrderTypeData = orderTypes.find(ot => ot.id === orderType)
  const serviceChargeAmount = (() => {
    if (!selectedOrderTypeData?.service_charge_enabled || !selectedOrderTypeData.service_charge_value) return 0
    if (selectedOrderTypeData.service_charge_type === 'percentage') {
      return Math.round(total * (selectedOrderTypeData.service_charge_value / 100) * 100) / 100
    }
    return selectedOrderTypeData.service_charge_value
  })()

  // Ref to track loading state and prevent duplicate fetches
  const isLoadingRef = useRef(false)
  // Ref to track if we've initialized the default order type
  const hasInitializedOrderType = useRef(false)

  // Load tenant data and order types from Supabase
  useEffect(() => {
    // Prevent duplicate fetches
    if (isLoadingRef.current) return
    isLoadingRef.current = true

    const loadData = async () => {
      try {
        // Parallelize tenant and order types fetching
        // We need tenant first to get tenant.id, but we can optimize by fetching order types
        // for common tenant slugs or fetch them in parallel if we have tenant slug pattern
        const tenantPromise = getTenantBySlugClient(tenantSlug)

        const { data, error: fetchError } = await tenantPromise
        if (fetchError || !data) {
          toast.error('Restaurant not found')
          router.push('/')
          return
        }
        setTenant(data)

        // Now fetch order types in parallel with any other operations
        // Since we need tenant.id, we fetch after tenant, but this is still faster
        // than the previous sequential approach
        const enabledOrderTypes = await getEnabledOrderTypesByTenantClient(data.id)
        setOrderTypes(enabledOrderTypes)

        // Set default order type if none selected (only set once on initial load)
        if (!hasInitializedOrderType.current && enabledOrderTypes.length > 0) {
          // Check current orderType value without including it in dependencies
          // This only runs once on mount
          if (!orderType) {
            setOrderType(enabledOrderTypes[0].id)
          }
          hasInitializedOrderType.current = true
        }
      } catch {
        toast.error('Failed to load restaurant')
        router.push('/')
      } finally {
        setIsLoading(false)
        isLoadingRef.current = false
      }
    }

    loadData()

    // Cleanup function to reset loading ref on unmount
    return () => {
      isLoadingRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantSlug, router, setOrderType])

  // Load form fields and payment methods when order type changes
  useEffect(() => {
    let isCancelled = false

    const loadFormFields = async () => {
      if (!tenant || !orderType) return

      try {
        // Load form fields and payment methods in parallel
        const [fieldsResult, methodsResult] = await Promise.allSettled([
          getCustomerFormFieldsByOrderTypeClient(orderType, tenant.id),
          getPaymentMethodsByOrderTypeClient(orderType, tenant.id)
        ])

        // Check if component was unmounted or order type changed
        if (isCancelled) return

        // Handle form fields
        if (fieldsResult.status === 'fulfilled') {
          const fields = fieldsResult.value
          setFormFields(fields)

          // Initialize customer data with empty values
          const initialData: Record<string, string> = {}
          fields.forEach(field => {
            initialData[field.field_name] = ''
          })
          setCustomerData(initialData)
        } else {
          console.error('Failed to load form fields:', fieldsResult.reason)
          toast.error('Failed to load form fields')
        }

        // Handle payment methods (optional - may not be configured yet)
        if (methodsResult.status === 'fulfilled') {
          const methods = methodsResult.value || []
          setPaymentMethods(methods)

          // Auto-select first payment method if only one available
          if (methods.length === 1) {
            setSelectedPaymentMethod(methods[0].id)
          } else {
            setSelectedPaymentMethod(null)
          }
        } else {
          // Payment methods not configured yet - this is okay, checkout can proceed without them
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

    // Cleanup function to cancel pending operations
    return () => {
      isCancelled = true
    }
  }, [tenant, orderType])

  // Redirect to menu if cart is empty
  // Don't redirect if checkout is in progress or has completed (prevents race condition with Messenger redirect)
  useEffect(() => {
    if (!isLoading && !isProcessing && !checkoutComplete && !checkoutCompleteRef.current && items.length === 0) {
      router.push(`/${tenantSlug}/menu`)
    }
  }, [items.length, router, tenantSlug, isLoading, isProcessing, checkoutComplete])

  // Auto-open Messenger in new tab when checkout completes, and auto-expand message if no URL
  useEffect(() => {
    if (!checkoutComplete) return
    if (completedOrderData?.messengerUrl) {
      // Open Messenger in a new tab automatically — confirmation screen stays on current tab
      window.open(completedOrderData.messengerUrl, '_blank', 'noopener,noreferrer')
    } else {
      // No Messenger URL — expand the order message so user can copy it
      setMessageExpanded(true)
    }
  }, [checkoutComplete, completedOrderData?.messengerUrl])

  // Fetch Lalamove delivery quotation when delivery address is entered
  useEffect(() => {
    let isCancelled = false // Prevent race conditions

    const fetchDeliveryQuote = async () => {
      // Check if this is a delivery order
      const selectedOrderType = orderTypes.find(ot => ot.id === orderType)
      const isDeliveryOrder = selectedOrderType?.type === 'delivery'

      // Check if Lalamove is enabled and restaurant address is configured
      const hasRestaurantAddress = tenant?.restaurant_address &&
        tenant?.restaurant_latitude &&
        tenant?.restaurant_longitude

      // Check if delivery address is provided
      const deliveryAddress = customerData.delivery_address
      const deliveryLat = customerData.delivery_lat
      const deliveryLng = customerData.delivery_lng

      if (!isDeliveryOrder || !tenant?.lalamove_enabled || !hasRestaurantAddress) {
        // Reset delivery fee if not applicable 
        setDeliveryFee(null)
        setQuotationId(null)
        setDeliveryFeeAddress('')
        setIsFetchingDeliveryFee(false)
        return
      }

      if (!deliveryAddress || !deliveryLat || !deliveryLng) {
        // Delivery address not yet entered
        setDeliveryFee(null)
        setQuotationId(null)
        setDeliveryFeeAddress('')
        setIsFetchingDeliveryFee(false)
        return
      }

      // IMMEDIATELY clear old delivery fee to prevent showing stale data
      setDeliveryFee(null)
      setQuotationId(null)
      setDeliveryFeeAddress('')
      setIsFetchingDeliveryFee(true)

      // Fetch quotation
      try {
        const result = await createQuotationAction(
          tenant.id,
          tenant.restaurant_address!,
          tenant.restaurant_latitude!,
          tenant.restaurant_longitude!,
          deliveryAddress,
          parseFloat(deliveryLat),
          parseFloat(deliveryLng)
        )

        // Only update state if this request hasn't been cancelled
        if (isCancelled) return

        if (result.success && result.data) {
          // Only set fee if the address still matches
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
      } catch (error) {
        if (isCancelled) return
        console.error('Error fetching delivery quote:', error)
        toast.error('Failed to calculate delivery fee')
        setDeliveryFee(null)
        setQuotationId(null)
        setDeliveryFeeAddress('')
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

  const handleProceedToPayment = () => {
    // Validate required fields
    const requiredFields = formFields.filter(field => field.is_required)
    const missingFields = requiredFields.filter(field => !customerData[field.field_name]?.trim())

    if (missingFields.length > 0) {
      toast.error(`Please fill in required fields: ${missingFields.map(f => f.field_label).join(', ')}`)
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

  const handleCheckout = async () => {
    if (!tenant || isProcessing || !orderType) return

    setIsProcessing(true)

    try {
      // Check if order management is enabled for this tenant
      let orderCreated = false
      let orderResult: { success: boolean; data?: { id: string }; orderToken?: string } | null = null

      // Get selected order type (for potential future use)
      // const selectedOrderType = orderTypes.find(ot => ot.id === orderType)

      // Get selected payment method details for snapshot
      const selectedPayment = paymentMethods.find(pm => pm.id === selectedPaymentMethod)

      if (tenant.enable_order_management) {
        // Only save to database if order management is enabled
        const orderItems = items.map(item => {
          // Calculate price including variations
          let itemPrice = item.menu_item.price

          // Handle legacy single variation
          if (item.selected_variation) {
            itemPrice += item.selected_variation.price_modifier
          }

          // Handle new grouped variations
          if (item.selected_variations) {
            const modifierSum = Object.values(item.selected_variations).reduce(
              (sum, option) => sum + option.price_modifier,
              0
            )
            itemPrice += modifierSum
          }

          // Format variation text
          let variationText = ''
          if (item.selected_variation) {
            variationText = item.selected_variation.name
          } else if (item.selected_variations) {
            variationText = Object.values(item.selected_variations)
              .map(opt => opt.name)
              .join(', ')
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

        const customerInfo = {
          name: customerData.customer_name || undefined,
          contact: customerData.customer_phone || customerData.customer_email || undefined,
        }

        try {
          // Only use delivery fee if it matches the current address
          const validDeliveryFee = (deliveryFee && deliveryFeeAddress === customerData.delivery_address) ? deliveryFee : undefined
          const validQuotationId = (quotationId && deliveryFeeAddress === customerData.delivery_address) ? quotationId : undefined

          const result = await createOrderAction(
            tenant.id,
            orderItems,
            customerInfo,
            orderType,
            // Include messenger_psid in customer data for tracking
            messengerPsid
              ? { ...customerData, messenger_psid: messengerPsid }
              : customerData,
            validDeliveryFee,
            validQuotationId,
            selectedPaymentMethod || undefined,
            selectedPayment?.name || undefined,
            selectedPayment?.details || undefined,
            selectedPayment?.qr_code_url || undefined,
            serviceChargeAmount || undefined
          )
          orderCreated = result.success
          orderResult = result

          if (result.success) {
            // Track upsell conversions if any cart items came from upsell modals
            const upsellItems = items.filter(i => i.upsellSource)
            if (upsellItems.length > 0) {
              const sourceBreakdown: Record<string, number> = {}
              let upsellRevenue = 0
              for (const ui of upsellItems) {
                const src = ui.upsellSource!
                sourceBreakdown[src] = (sourceBreakdown[src] || 0) + 1
                upsellRevenue += ui.subtotal
              }
              trackAnalyticsEventAction(tenant.id, 'upsell_converted', {
                orderId: result.data?.id,
                upsellItemCount: upsellItems.length,
                upsellRevenue,
                sources: sourceBreakdown,
              })
            }
          } else {
            console.warn('Order creation failed:', result.error)
            toast.warning('Order creation failed, but proceeding to Messenger...')
          }
        } catch (error) {
          console.warn('Order creation error:', error)
          toast.warning('Order creation failed, but proceeding to Messenger...')
        }
      }

      // ── PHASE 2: Generate order message ──────────────────────────────────
      // Do this before showing confirmation so the message is ready for copy-paste

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
        serviceChargeAmount || undefined
      )

      // ── PHASE 3: Resolve Messenger URL (best-effort, never blocks confirmation) ──
      let pageId: string | null = null

      if (tenant.facebook_page_id) {
        try {
          const { createClient } = await import('@/lib/supabase/client')
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

      if (!pageId) {
        pageId = tenant.messenger_username || tenant.messenger_page_id || null
      }

      const isFacebookPageConnected = tenant.facebook_page_id !== null &&
        tenant.facebook_page_id !== undefined &&
        pageId !== null &&
        (pageId !== tenant.messenger_username && pageId !== tenant.messenger_page_id)

      const useDirectMode = tenant.messenger_redirect_mode === 'direct'

      let messengerUrl: string | null = null

      if (pageId && pageId.trim() !== '') {
        if (useDirectMode) {
          messengerUrl = generateMessengerDirectUrl(pageId)
        } else if (isFacebookPageConnected) {
          const orderId = orderCreated && orderResult?.data?.id ? orderResult.data.id : null
          messengerUrl = orderId
            ? generateMessengerCombinedUrl(pageId, orderId, message)
            : generateMessengerUrl(pageId, message)
        } else {
          messengerUrl = generateMessengerUrl(pageId, message)
        }
      }
      // If messengerUrl is still null, that's OK — confirmation screen handles it gracefully

      // ── PHASE 4: Show confirmation screen IMMEDIATELY ─────────────────────
      // This ALWAYS happens regardless of Messenger config. Order is placed — customer
      // must always see their summary and be able to copy the message manually.

      const selectedOrderTypeName = orderTypes.find(ot => ot.id === orderType)?.name ?? null
      const selectedPaymentName = paymentMethods.find(pm => pm.id === selectedPaymentMethod)?.name ?? null
      const selectedPaymentDetails = paymentMethods.find(pm => pm.id === selectedPaymentMethod)?.details ?? null
      const formFieldsMeta2 = formFields.map(f => ({ field_name: f.field_name, field_label: f.field_label }))

      setCompletedOrderData({
        items: [...items],
        total,
        deliveryFee: (deliveryFee && deliveryFeeAddress === customerData.delivery_address) ? deliveryFee : null,
        serviceChargeAmount,
        customerData: { ...customerData },
        orderTypeName: selectedOrderTypeName,
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

      // ── PHASE 5: Messenger (fire-and-forget, non-blocking) ────────────────

      // Proactive webhook send (background, does not block)
      if (!useDirectMode && isFacebookPageConnected && orderCreated && orderResult?.data?.id && orderResult?.orderToken) {
        fetch('/api/messenger/send-order-public', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: orderResult.data.id,
            tenantId: tenant.id,
            orderToken: orderResult.orderToken,
          }),
        })
          .then(async (response) => {
            if (response.ok) {
              const result = await response.json().catch(() => null)
              if (result?.success) console.log('[Checkout] Order message sent proactively')
            }
          })
          .catch((error) => console.warn('[Checkout] Proactive send error (non-blocking):', error))
      }

      // Messenger window.open is handled by useEffect triggered by checkoutComplete state
    } catch (error) {
      console.error('Checkout error:', error)
      toast.error('An error occurred. Please try again.')
      setIsProcessing(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-orange-50/30 to-orange-100/20 flex items-center justify-center">
        <div className="text-center">
          <div className="h-16 w-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading checkout...</p>
        </div>
      </div>
    )
  }

  if (!tenant) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-orange-50/30 to-orange-100/20 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Restaurant not found</p>
        </div>
      </div>
    )
  }

  // Order Confirmation / Thank You view
  if (checkoutComplete && completedOrderData) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50/40 to-white">
        <main className="container mx-auto px-4 py-8">
          <div className="mx-auto max-w-2xl space-y-6">

            {/* Success Hero */}
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-24 h-24 bg-green-100 rounded-full mb-5">
                <CheckCircle2 className="h-14 w-14 text-green-600 animate-[scale-in_0.4s_ease-out]" />
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Order Placed!</h1>
              <p className="text-gray-500 text-lg">Your order has been sent to {tenant.name}</p>
            </div>

            {/* Order Summary */}
            <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold text-gray-900 mb-1">Order Summary</h2>
              {completedOrderData.orderTypeName && (
                <p className="text-sm text-gray-500 mb-4">{completedOrderData.orderTypeName}</p>
              )}

              <div className="space-y-3">
                {completedOrderData.items.map((item, index) => (
                  <div key={item.id}>
                    {index > 0 && <Separator className="my-3" />}
                    <div className="flex justify-between">
                      <div className="flex-1 mr-4">
                        <span className="font-medium text-sm">{item.menu_item.name}</span>
                        {item.selected_variation && (
                          <span className="text-xs text-muted-foreground"> ({item.selected_variation.name})</span>
                        )}
                        {item.selected_variations && Object.keys(item.selected_variations).length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {' '}({Object.values(item.selected_variations).map(opt => opt.name).join(', ')})
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground"> x{item.quantity}</span>
                        {item.selected_addons.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Add-ons: {item.selected_addons.map(a => a.name).join(', ')}
                          </p>
                        )}
                        {item.special_instructions && (
                          <p className="text-xs italic text-muted-foreground mt-0.5">
                            Note: {item.special_instructions}
                          </p>
                        )}
                      </div>
                      <span className="font-semibold text-sm flex-shrink-0">{formatPrice(item.subtotal)}</span>
                    </div>
                  </div>
                ))}

                <Separator className="my-3" />

                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-medium">{formatPrice(completedOrderData.total)}</span>
                </div>

                {completedOrderData.deliveryFee !== null && completedOrderData.deliveryFee > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Delivery Fee</span>
                    <span className="font-medium">{formatPrice(completedOrderData.deliveryFee)}</span>
                  </div>
                )}

                {completedOrderData.serviceChargeAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Service Charge</span>
                    <span className="font-medium">{formatPrice(completedOrderData.serviceChargeAmount)}</span>
                  </div>
                )}

                <Separator className="my-2" />

                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span className="text-green-700">
                    {formatPrice(completedOrderData.total + (completedOrderData.deliveryFee ?? 0) + completedOrderData.serviceChargeAmount)}
                  </span>
                </div>
              </div>
            </div>

            {/* Customer Information */}
            {completedOrderData.formFields.length > 0 && (
              <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Customer Information</h2>
                <div className="space-y-2">
                  {completedOrderData.formFields.map(field => {
                    const value = completedOrderData.customerData[field.field_name]
                    if (!value) return null
                    return (
                      <div key={field.field_name} className="flex justify-between text-sm">
                        <span className="text-gray-600">{field.field_label}</span>
                        <span className="font-medium text-right ml-4 max-w-[60%] break-words">{value}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Payment Method */}
            {completedOrderData.paymentMethodName && (
              <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
                <h2 className="text-lg font-bold text-gray-900 mb-2">Payment Method</h2>
                <p className="font-medium text-gray-900">{completedOrderData.paymentMethodName}</p>
                {completedOrderData.paymentMethodDetails && (
                  <p className="text-sm text-gray-600 mt-1">{completedOrderData.paymentMethodDetails}</p>
                )}
              </div>
            )}

            {/* Messenger Action Section */}
            <div className="space-y-3">
              {completedOrderData.messengerUrl ? (
                <Button
                  size="lg"
                  className="w-full h-12 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-full"
                  onClick={() => window.open(completedOrderData.messengerUrl, '_blank', 'noopener,noreferrer')}
                >
                  <ExternalLink className="mr-2 h-5 w-5" />
                  Go to Messenger
                </Button>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  Copy the order message below and send it to the restaurant via Messenger or any chat app.
                </div>
              )}
            </div>

            {/* Order Message Box (collapsible) */}
            <div className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden">
              <button
                onClick={() => setMessageExpanded(!messageExpanded)}
                aria-expanded={messageExpanded}
                className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 transition-colors"
              >
                <h2 className="text-lg font-bold text-gray-900">Order Message</h2>
                <span className="text-sm text-gray-400">{messageExpanded ? 'Hide' : 'Show'}</span>
              </button>

              {messageExpanded && (
                <div className="px-6 pb-6 space-y-3">
                  <div className="bg-gray-50 rounded-xl p-4 max-h-64 overflow-y-auto">
                    <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
                      {completedOrderData.messengerMessage}
                    </pre>
                  </div>

                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full h-12 rounded-full border-green-300 text-green-700 hover:bg-green-50"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(completedOrderData.messengerMessage)
                        toast.success('Order message copied to clipboard!')
                      } catch {
                        toast.error('Failed to copy message')
                      }
                    }}
                  >
                    <Copy className="mr-2 h-5 w-5" />
                    Copy Order Message
                  </Button>

                  <p className="text-xs text-gray-400 text-center">
                    Paste this in Messenger or any chat app
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="pb-8">
              <Button
                size="lg"
                variant="ghost"
                className="w-full h-12 rounded-full text-gray-600 hover:text-gray-900"
                onClick={() => router.push(`/${tenantSlug}/menu`)}
              >
                <ArrowLeft className="mr-2 h-5 w-5" />
                Back to Menu
              </Button>
            </div>

          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50/30 to-orange-100/20">
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-orange-200/30">
        <div className="container mx-auto flex h-20 items-center gap-4 px-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="hover:bg-orange-50">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Checkout</h1>
            <p className="text-sm text-gray-500">Complete your order</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-4xl space-y-8">
          {/* Order Type Selection */}
          {orderTypes.length > 0 && (
            <div className="rounded-2xl bg-white p-4 sm:p-6 md:p-8 shadow-sm">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3">How would you like to receive your order?</h2>

              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {orderTypes.map((ot) => {
                  const isSelected = orderType === ot.id
                  const iconMap = {
                    dine_in: UtensilsCrossed,
                    pickup: Package,
                    delivery: Truck,
                  }
                  const Icon = iconMap[ot.type]

                  return (
                    <Card
                      key={ot.id}
                      className={`cursor-pointer transition-all hover:shadow-md ${isSelected ? 'ring-2 ring-orange-500 bg-orange-50' : 'hover:bg-gray-50'
                        }`}
                      onClick={() => setOrderType(ot.id)}
                    >
                      <CardContent className="p-3 sm:p-4 text-center">
                        <Icon className={`h-5 w-5 sm:h-6 sm:w-6 mx-auto mb-1.5 sm:mb-2 ${isSelected ? 'text-orange-600' : 'text-gray-600'}`} />
                        <h3 className="font-semibold text-xs sm:text-sm md:text-base">{ot.name}</h3>
                        {isSelected && (
                          <Badge className="mt-1.5 sm:mt-2 bg-orange-500 text-[10px] sm:text-xs px-1.5 py-0">✓</Badge>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}

          {/* Customer Information Form */}
          {orderType && formFields.length > 0 && (
            <div className="rounded-2xl bg-white p-8 shadow-sm">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Customer Information</h2>
              <p className="text-gray-600 mb-6">Please provide the following details</p>

              <div className="grid gap-4 md:grid-cols-2">
                {formFields.map((field) => (
                  <div key={field.id} className={field.field_type === 'textarea' || field.field_name === 'delivery_address' ? 'md:col-span-2' : ''}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {field.field_label}
                      {field.is_required && <span className="text-red-500 ml-1">*</span>}
                    </label>

                    {/* Special handling for delivery address with Mapbox Autocomplete */}
                    {field.field_name === 'delivery_address' ? (
                      <MapboxAddressAutocomplete
                        value={customerData[field.field_name] || ''}
                        onChange={(address, coordinates) => {
                          setCustomerData(prev => ({
                            ...prev,
                            [field.field_name]: address,
                            ...(coordinates && {
                              delivery_lat: String(coordinates.lat),
                              delivery_lng: String(coordinates.lng),
                            }),
                          }))
                        }}
                        placeholder={field.placeholder || 'Start typing your address...'}
                        required={field.is_required}
                        mapboxEnabled={tenant?.mapbox_enabled ?? true}
                      />
                    ) : field.field_type === 'textarea' ? (
                      <textarea
                        value={customerData[field.field_name] || ''}
                        onChange={(e) => setCustomerData(prev => ({ ...prev, [field.field_name]: e.target.value }))}
                        placeholder={field.placeholder}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                        rows={3}
                      />
                    ) : field.field_type === 'select' ? (
                      <select
                        value={customerData[field.field_name] || ''}
                        onChange={(e) => setCustomerData(prev => ({ ...prev, [field.field_name]: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        <option value="">Select {field.field_label}</option>
                        {field.options?.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    ) : field.field_type === 'phone' && (tenant?.lalamove_market || '').toUpperCase() === 'PH' ? (
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-700 font-medium pointer-events-none">
                          +63
                        </div>
                        <input
                          type="tel"
                          value={(() => {
                            const value = customerData[field.field_name] || ''
                            // Remove +63 prefix if present to show only the number part
                            if (value.startsWith('+63')) {
                              return value.slice(3).replace(/\D/g, '')
                            }
                            // Remove + if present
                            if (value.startsWith('+')) {
                              return value.slice(1).replace(/\D/g, '')
                            }
                            // Remove leading 0 if present
                            if (value.startsWith('0')) {
                              return value.slice(1).replace(/\D/g, '')
                            }
                            return value.replace(/\D/g, '')
                          })()}
                          onChange={(e) => {
                            let inputValue = e.target.value.replace(/\D/g, '') // Only digits

                            // Prevent 0 as the first digit
                            if (inputValue.startsWith('0')) {
                              inputValue = inputValue.slice(1)
                            }

                            // Limit to 10 digits (standard PH mobile number length)
                            if (inputValue.length > 10) {
                              inputValue = inputValue.slice(0, 10)
                            }

                            // Store with +63 prefix
                            setCustomerData(prev => ({
                              ...prev,
                              [field.field_name]: inputValue ? `+63${inputValue}` : ''
                            }))
                          }}
                          placeholder="9XXXXXXXXX"
                          maxLength={10}
                          className="w-full pl-12 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
                          {(() => {
                            const value = customerData[field.field_name] || ''
                            const digits = value.replace(/\D/g, '').replace(/^63/, '').replace(/^0/, '')
                            return `${digits.length}/10`
                          })()}
                        </div>
                      </div>
                    ) : (
                      <input
                        type={field.field_type === 'email' ? 'email' : field.field_type === 'number' ? 'number' : 'text'}
                        value={customerData[field.field_name] || ''}
                        onChange={(e) => setCustomerData(prev => ({ ...prev, [field.field_name]: e.target.value }))}
                        placeholder={field.placeholder}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Order Summary</h2>
            <p className="text-gray-600 mb-6">Review your order before checkout</p>

            <div className="space-y-4">
              {items.map((item, index) => (
                <div key={item.id}>
                  {index > 0 && <Separator className="my-4" />}
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <div className="flex-1 mr-4">
                        <span className="font-medium">{item.menu_item.name}</span>

                        {/* Legacy single variation */}
                        {item.selected_variation && (
                          <span className="text-sm text-muted-foreground">
                            {' '}
                            ({item.selected_variation.name})
                          </span>
                        )}

                        {/* New grouped variations */}
                        {item.selected_variations && Object.keys(item.selected_variations).length > 0 && (
                          <span className="text-sm text-muted-foreground">
                            {' '}
                            ({Object.values(item.selected_variations).map(opt => opt.name).join(', ')})
                          </span>
                        )}

                        <span className="text-sm text-muted-foreground"> x{item.quantity}</span>
                      </div>
                      <span className="font-semibold flex-shrink-0">{formatPrice(item.subtotal)}</span>
                    </div>

                    {item.selected_addons.length > 0 && (
                      <p className="text-sm text-muted-foreground">
                        Add-ons: {item.selected_addons.map((a) => a.name).join(', ')}
                      </p>
                    )}

                    {item.special_instructions && (
                      <p className="text-sm italic text-muted-foreground">
                        Note: {item.special_instructions}
                      </p>
                    )}
                  </div>
                </div>
              ))}

              <Separator className="my-4" />

              {/* Delivery Fee */}
              {(deliveryFee !== null || isFetchingDeliveryFee) && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">
                      Delivery Fee
                    </span>
                    <span className="font-semibold">
                      {isFetchingDeliveryFee ? (
                        <span className="text-orange-500 animate-pulse">Calculating...</span>
                      ) : (deliveryFee !== null && deliveryFeeAddress === customerData.delivery_address) ? (
                        formatPrice(deliveryFee)
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </span>
                  </div>
                  <Separator className="my-2" />
                </>
              )}

              {/* Service Charge */}
              {serviceChargeAmount > 0 && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Service Charge</span>
                    <span className="font-semibold">{formatPrice(serviceChargeAmount)}</span>
                  </div>
                  <Separator className="my-2" />
                </>
              )}

              <div className="flex justify-between text-xl font-bold pt-4 border-t">
                <span>Total</span>
                <span className="text-orange-600">
                  {isFetchingDeliveryFee ? (
                    <span className="animate-pulse">Calculating...</span>
                  ) : (
                    formatPrice(total + ((deliveryFee && deliveryFeeAddress === customerData.delivery_address) ? deliveryFee : 0) + serviceChargeAmount)
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Payment Method Selection */}
          {paymentMethods.length > 0 ? (
            <div className="rounded-2xl bg-white p-8 shadow-sm" data-payment-methods>
              <h2 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-3">
                <CreditCard className="h-6 w-6 text-orange-500" />
                Select Payment Method
                <Badge variant="outline" className="ml-auto bg-red-50 text-red-700 border-red-300">
                  Required
                </Badge>
              </h2>
              <p className="text-gray-600 mb-6">
                Choose how you would like to pay for your order
              </p>

              <div className="space-y-3">
                {paymentMethods.map((method) => {
                  const isSelected = selectedPaymentMethod === method.id

                  return (
                    <label
                      key={method.id}
                      className={`flex items-start gap-4 p-4 border-2 rounded-lg cursor-pointer transition-all hover:border-orange-300 hover:bg-orange-50/50 ${isSelected ? 'border-orange-500 bg-orange-50' : 'border-gray-200'
                        }`}
                      onClick={() => setSelectedPaymentMethod(method.id)}
                    >
                      {/* Radio Button */}
                      <div className="flex items-center h-6 mt-0.5">
                        <input
                          type="radio"
                          checked={isSelected}
                          onChange={() => setSelectedPaymentMethod(method.id)}
                          className="w-4 h-4 text-orange-600 focus:ring-orange-500 focus:ring-2"
                        />
                      </div>

                      {/* QR Code Thumbnail */}
                      {method.qr_code_url && (
                        <div
                          className="shrink-0 cursor-pointer hover:opacity-80"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (method.qr_code_url) {
                              setSelectedQrCode(method.qr_code_url)
                              setQrDialogOpen(true)
                            }
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={method.qr_code_url}
                            alt={`${method.name} QR Code`}
                            className="w-12 h-12 object-cover rounded border"
                          />
                          <div className="text-xs text-gray-500 text-center mt-1 flex items-center justify-center gap-1">
                            <QrCode className="h-3 w-3" />
                          </div>
                        </div>
                      )}

                      {/* Payment Method Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-base mb-1">{method.name}</h3>
                        {method.details && (
                          <p className="text-sm text-gray-600 line-clamp-2">
                            {method.details}
                          </p>
                        )}
                      </div>
                    </label>
                  )
                })}
              </div>

              {/* Selected Payment Method Details */}
              {selectedPaymentMethod && (
                <div className="mt-6 p-4 bg-orange-50 border-2 border-orange-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <CreditCard className="h-5 w-5 text-orange-600 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-orange-900 mb-2">Selected Payment Method</h3>
                      <p className="font-medium text-gray-900 mb-2">
                        {paymentMethods.find(m => m.id === selectedPaymentMethod)?.name}
                      </p>
                      {paymentMethods.find(m => m.id === selectedPaymentMethod)?.details && (
                        <div className="bg-white p-3 rounded border border-orange-200">
                          <p className="text-sm font-medium text-gray-700 mb-2">Payment Details:</p>
                          <div className="space-y-2">
                            {paymentMethods.find(m => m.id === selectedPaymentMethod)?.details?.split('\n').map((line, index) => {
                              const trimmedLine = line.trim()
                              if (!trimmedLine) return null
                              return (
                                <button
                                  key={index}
                                  type="button"
                                  onClick={() => handleCopyText(trimmedLine, 'Details')}
                                  className="w-full flex items-center justify-between gap-2 p-2 rounded-md bg-gray-50 hover:bg-orange-100 transition-colors text-left group"
                                >
                                  <span className="text-sm text-gray-700 break-all">{trimmedLine}</span>
                                  {copiedText === trimmedLine ? (
                                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                                  ) : (
                                    <Copy className="h-4 w-4 text-gray-400 group-hover:text-orange-500 shrink-0" />
                                  )}
                                </button>
                              )
                            })}
                          </div>
                          <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                            <Copy className="h-3 w-3" /> Tap on any line to copy
                          </p>
                        </div>
                      )}
                      {(() => {
                        const qrUrl = paymentMethods.find(m => m.id === selectedPaymentMethod)?.qr_code_url
                        if (!qrUrl) return null

                        return (
                          <div className="mt-3 flex items-center gap-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={qrUrl}
                              alt="Payment QR Code"
                              className="w-32 h-32 object-contain border-2 border-orange-300 rounded-lg bg-white p-2 cursor-pointer hover:opacity-80"
                              onClick={() => {
                                setSelectedQrCode(qrUrl)
                                setQrDialogOpen(true)
                              }}
                            />
                            <div className="flex-1">
                              <p className="text-sm text-gray-600 mb-2">Scan this QR code to complete payment</p>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedQrCode(qrUrl)
                                  setQrDialogOpen(true)
                                }}
                                className="border-orange-300 text-orange-700 hover:bg-orange-100"
                              >
                                <QrCode className="h-4 w-4 mr-2" />
                                View Full Size
                              </Button>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : orderType && tenant ? (
            <div className="rounded-2xl bg-yellow-50 border-2 border-yellow-200 p-6">
              <div className="flex items-start gap-3">
                <div className="text-yellow-600 mt-1">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-yellow-900 mb-1">No Payment Methods Available</h3>
                  <p className="text-sm text-yellow-800">
                    No payment methods have been set up for this order type yet. You can still proceed with your order, and payment details will be discussed via Messenger.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-3">
              <MessageCircle className="h-6 w-6 text-orange-500" />
              {paymentMethods.length > 0 ? 'Complete Order' : 'Complete Order via Messenger'}
            </h2>
            <p className="text-gray-600 mb-6">
              {paymentMethods.length > 0
                ? `After selecting your payment method, click below to complete your order with ${tenant.name}.`
                : `Click the button below to send your order to ${tenant.name} via Facebook Messenger. You'll be redirected to Messenger with your order details pre-filled.`
              }
            </p>

            <Button
              size="lg"
              className="w-full h-14 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleProceedToPayment}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-3"></div>
                  Processing Order...
                </>
              ) : paymentMethods.length > 0 ? (
                <>
                  <CreditCard className="mr-3 h-6 w-6" />
                  Proceed to Payment
                </>
              ) : (
                <>
                  <MessageCircle className="mr-3 h-6 w-6" />
                  Send Order via Messenger
                </>
              )}
            </Button>

            <p className="text-center text-sm text-gray-500 mt-4">
              Your order will be sent to the restaurant for confirmation
            </p>
          </div>
        </div>
      </main>

      {/* Payment Details Dialog */}
      {showPaymentDetails && selectedPaymentMethod && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-100 rounded-full mb-4">
                <CreditCard className="h-8 w-8 text-orange-600" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-2">Complete Payment</h2>
              <p className="text-gray-600">
                Please complete payment using the details below
              </p>
            </div>

            {/* Payment Method Details */}
            <div className="space-y-6">
              {/* Payment Method Name */}
              <div className="text-center">
                <p className="text-sm text-gray-500 mb-1">Payment Method</p>
                <h3 className="text-2xl font-bold text-gray-900">
                  {paymentMethods.find(m => m.id === selectedPaymentMethod)?.name}
                </h3>
              </div>

              {/* QR Code - Centered and Large */}
              {(() => {
                const qrUrl = paymentMethods.find(m => m.id === selectedPaymentMethod)?.qr_code_url
                if (!qrUrl) return null

                return (
                  <div className="flex flex-col items-center gap-4 py-4 bg-gray-50 rounded-xl">
                    <p className="text-sm font-medium text-gray-700">Scan QR Code to Pay</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qrUrl}
                      alt="Payment QR Code"
                      className="w-64 h-64 object-contain border-4 border-white rounded-xl shadow-lg"
                    />
                    <p className="text-xs text-gray-500">Scan with your payment app</p>
                  </div>
                )
              })()}

              {/* Payment Details */}
              {paymentMethods.find(m => m.id === selectedPaymentMethod)?.details && (
                <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-6">
                  <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <span className="inline-block w-2 h-2 bg-orange-500 rounded-full"></span>
                    Payment Instructions
                  </h4>
                  <div className="bg-white p-4 rounded-lg border border-orange-200">
                    <div className="space-y-2">
                      {paymentMethods.find(m => m.id === selectedPaymentMethod)?.details?.split('\n').map((line, index) => {
                        const trimmedLine = line.trim()
                        if (!trimmedLine) return null
                        return (
                          <button
                            key={index}
                            type="button"
                            onClick={() => handleCopyText(trimmedLine, 'Details')}
                            className="w-full flex items-center justify-between gap-3 p-3 rounded-lg bg-gray-50 hover:bg-orange-100 transition-colors text-left group"
                          >
                            <span className="text-sm text-gray-700 break-all leading-relaxed">{trimmedLine}</span>
                            {copiedText === trimmedLine ? (
                              <Check className="h-5 w-5 text-green-500 shrink-0" />
                            ) : (
                              <Copy className="h-5 w-5 text-gray-400 group-hover:text-orange-500 shrink-0" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-xs text-gray-500 mt-3 flex items-center justify-center gap-1 pt-2 border-t border-gray-100">
                      <Copy className="h-3 w-3" /> Tap on any line to copy
                    </p>
                  </div>
                </div>
              )}

              {/* Order Summary */}
              <div className="bg-gray-50 rounded-xl p-6">
                <h4 className="font-semibold text-gray-900 mb-4">Order Summary</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="font-medium">{formatPrice(total)}</span>
                  </div>
                  {deliveryFee !== null && deliveryFee > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Delivery Fee</span>
                      <span className="font-medium">{formatPrice(deliveryFee)}</span>
                    </div>
                  )}
                  {serviceChargeAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Service Charge</span>
                      <span className="font-medium">{formatPrice(serviceChargeAmount)}</span>
                    </div>
                  )}
                  <Separator className="my-2" />
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total Amount to Pay</span>
                    <span className="text-orange-600">{formatPrice(total + (deliveryFee || 0) + serviceChargeAmount)}</span>
                  </div>
                </div>
              </div>

              {/* Important Note */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="text-blue-600 mt-0.5">
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="flex-1 text-sm text-blue-800">
                    <p className="font-medium mb-1">Next Step:</p>
                    <p>After completing payment, click the button below to send your order confirmation to the restaurant via Messenger.</p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setShowPaymentDetails(false)}
                  disabled={isProcessing}
                  className="flex-1"
                >
                  Go Back
                </Button>
                <Button
                  size="lg"
                  onClick={handleCheckout}
                  disabled={isProcessing}
                  className="flex-1 bg-orange-500 hover:bg-orange-600"
                >
                  {isProcessing ? (
                    <>
                      <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                      Processing...
                    </>
                  ) : (
                    <>
                      <MessageCircle className="h-5 w-5 mr-2" />
                      Order Now
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Dialog */}
      {qrDialogOpen && selectedQrCode && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setQrDialogOpen(false)}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">Payment QR Code</h3>
              <button
                onClick={() => setQrDialogOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <span className="sr-only">Close</span>
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedQrCode}
              alt="Payment QR Code"
              className="w-full h-auto object-contain rounded"
            />
            <p className="text-sm text-gray-500 text-center mt-4">
              Scan this QR code with your payment app
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

