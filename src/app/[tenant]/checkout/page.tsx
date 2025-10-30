'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ArrowLeft, MessageCircle, UtensilsCrossed, Package, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useCart } from '@/hooks/useCart'
import { formatPrice, generateMessengerMessage, generateMessengerUrl } from '@/lib/cart-utils'
import { getTenantBySlugSupabase } from '@/lib/tenants-service'
import { getEnabledOrderTypesByTenantClient, getCustomerFormFieldsByOrderTypeClient } from '@/lib/order-types-client'
import { createOrderAction } from '@/app/actions/orders'
import { createQuotationAction } from '@/app/actions/lalamove'
import { MapboxAddressAutocomplete } from '@/components/shared/mapbox-address-autocomplete'
import { toast } from 'sonner'
import type { Tenant, OrderType, CustomerFormField } from '@/types/database'

export default function CheckoutPage() {
  const params = useParams()
  const router = useRouter()
  const tenantSlug = params.tenant as string
  const { items, total, clearCart, orderType, setOrderType } = useCart()

  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [orderTypes, setOrderTypes] = useState<OrderType[]>([])
  const [formFields, setFormFields] = useState<CustomerFormField[]>([])
  const [customerData, setCustomerData] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  
  // Lalamove delivery fee state
  const [deliveryFee, setDeliveryFee] = useState<number | null>(null)
  const [quotationId, setQuotationId] = useState<string | null>(null)
  const [isFetchingDeliveryFee, setIsFetchingDeliveryFee] = useState(false)

  // Load tenant data and order types from Supabase
  useEffect(() => {
    const loadData = async () => {
      try {
        const { data, error: fetchError } = await getTenantBySlugSupabase(tenantSlug)
        if (fetchError || !data) {
          toast.error('Restaurant not found')
          router.push('/')
          return
        }
        setTenant(data)

        // Load enabled order types
        const enabledOrderTypes = await getEnabledOrderTypesByTenantClient(data.id)
        setOrderTypes(enabledOrderTypes)

        // Set default order type if none selected
        if (!orderType && enabledOrderTypes.length > 0) {
          setOrderType(enabledOrderTypes[0].id)
        }
      } catch {
        toast.error('Failed to load restaurant')
        router.push('/')
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [tenantSlug, router, orderType, setOrderType])

  // Load form fields when order type changes
  useEffect(() => {
    const loadFormFields = async () => {
      if (!tenant || !orderType) return

      try {
        const fields = await getCustomerFormFieldsByOrderTypeClient(orderType, tenant.id)
        setFormFields(fields)
        
        // Initialize customer data with empty values
        const initialData: Record<string, string> = {}
        fields.forEach(field => {
          initialData[field.field_name] = ''
        })
        setCustomerData(initialData)
      } catch (error) {
        console.error('Failed to load form fields:', error)
        toast.error('Failed to load form fields')
      }
    }

    loadFormFields()
  }, [tenant, orderType])

  // Redirect to menu if cart is empty
  useEffect(() => {
    if (!isLoading && items.length === 0) {
      router.push(`/${tenantSlug}/menu`)
    }
  }, [items.length, router, tenantSlug, isLoading])

  // Fetch Lalamove delivery quotation when delivery address is entered
  useEffect(() => {
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
        return
      }
      
      if (!deliveryAddress || !deliveryLat || !deliveryLng) {
        // Delivery address not yet entered
        setDeliveryFee(null)
        setQuotationId(null)
        return
      }
      
      // Fetch quotation
      setIsFetchingDeliveryFee(true)
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
        
        if (result.success && result.data) {
          setDeliveryFee(result.data.price)
          setQuotationId(result.data.quotationId)
        } else {
          console.error('Failed to fetch delivery quote:', result.error)
          toast.error(result.error || 'Failed to get delivery fee')
          setDeliveryFee(null)
          setQuotationId(null)
        }
      } catch (error) {
        console.error('Error fetching delivery quote:', error)
        toast.error('Failed to calculate delivery fee')
        setDeliveryFee(null)
        setQuotationId(null)
      } finally {
        setIsFetchingDeliveryFee(false)
      }
    }
    
    fetchDeliveryQuote()
  }, [tenant, orderTypes, orderType, customerData.delivery_address, customerData.delivery_lat, customerData.delivery_lng])

  const handleCheckout = async () => {
    if (!tenant || isProcessing || !orderType) return

    // Validate required fields
    const requiredFields = formFields.filter(field => field.is_required)
    const missingFields = requiredFields.filter(field => !customerData[field.field_name]?.trim())
    
    if (missingFields.length > 0) {
      toast.error(`Please fill in required fields: ${missingFields.map(f => f.field_label).join(', ')}`)
      return
    }

    setIsProcessing(true)

    try {
      // Check if order management is enabled for this tenant
      let orderCreated = false
      
      // Get selected order type for messenger message
      const selectedOrderType = orderTypes.find(ot => ot.id === orderType)
      
      if (tenant.enable_order_management) {
        // Only save to database if order management is enabled
        const orderItems = items.map(item => ({
          menu_item_id: item.menu_item.id,
          menu_item_name: item.menu_item.name,
          variation: item.selected_variation?.name,
          addons: item.selected_addons.map(a => a.name),
          quantity: item.quantity,
          price: item.menu_item.price + (item.selected_variation?.price_modifier || 0),
          subtotal: item.subtotal,
          special_instructions: item.special_instructions,
        }))

        const customerInfo = {
          name: customerData.customer_name || undefined,
          contact: customerData.customer_phone || customerData.customer_email || undefined,
        }

        try {
          const result = await createOrderAction(
            tenant.id, 
            orderItems, 
            customerInfo, 
            orderType, 
            customerData,
            deliveryFee || undefined,
            quotationId || undefined
          )
          orderCreated = result.success

          if (result.success) {
            toast.success('Order created successfully!')
          } else {
            console.warn('Order creation failed:', result.error)
            toast.warning('Order creation failed, but proceeding to Messenger...')
          }
        } catch (error) {
          console.warn('Order creation error:', error)
          toast.warning('Order creation failed, but proceeding to Messenger...')
        }
      }

      // Generate messenger message and URL (always proceed)
      const message = generateMessengerMessage(items, tenant.name, orderCreated, selectedOrderType, customerData)
      const messengerUrl = generateMessengerUrl(
        tenant.messenger_username || tenant.messenger_page_id,
        message,
        !tenant.messenger_username
      )

      // Clear cart
      clearCart()

      // Show success message
      toast.success('Redirecting to Messenger...')

      // Redirect to Messenger
      setTimeout(() => {
        window.location.href = messengerUrl
      }, 1000)
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
            <div className="rounded-2xl bg-white p-8 shadow-sm">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">How would you like to receive your order?</h2>
              <p className="text-gray-600 mb-6">Choose your preferred order type</p>
              
              <div className="grid gap-4 md:grid-cols-3">
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
                      className={`cursor-pointer transition-all hover:shadow-md ${
                        isSelected ? 'ring-2 ring-orange-500 bg-orange-50' : 'hover:bg-gray-50'
                      }`}
                      onClick={() => setOrderType(ot.id)}
                    >
                      <CardContent className="p-6 text-center">
                        <Icon className={`h-8 w-8 mx-auto mb-3 ${isSelected ? 'text-orange-600' : 'text-gray-600'}`} />
                        <h3 className="font-semibold text-lg mb-2">{ot.name}</h3>
                        {ot.description && (
                          <p className="text-sm text-gray-600">{ot.description}</p>
                        )}
                        {isSelected && (
                          <Badge className="mt-3 bg-orange-500">Selected</Badge>
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
                    ) : (
                      <input
                        type={field.field_type === 'email' ? 'email' : field.field_type === 'phone' ? 'tel' : field.field_type === 'number' ? 'number' : 'text'}
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
                      <div>
                        <span className="font-medium">{item.menu_item.name}</span>
                        {item.selected_variation && (
                          <span className="text-sm text-muted-foreground">
                            {' '}
                            ({item.selected_variation.name})
                          </span>
                        )}
                        <span className="text-sm text-muted-foreground"> x{item.quantity}</span>
                      </div>
                      <span className="font-semibold">{formatPrice(item.subtotal)}</span>
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
              {deliveryFee !== null && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">
                      Delivery Fee{isFetchingDeliveryFee && ' (calculating...)'}
                    </span>
                    <span className="font-semibold">
                      {isFetchingDeliveryFee ? (
                        <span className="animate-pulse">...</span>
                      ) : (
                        formatPrice(deliveryFee)
                      )}
                    </span>
                  </div>
                  <Separator className="my-2" />
                </>
              )}

              <div className="flex justify-between text-xl font-bold pt-4 border-t">
                <span>Total</span>
                <span className="text-orange-600">
                  {formatPrice(total + (deliveryFee || 0))}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-3">
              <MessageCircle className="h-6 w-6 text-orange-500" />
              Complete Order via Messenger
            </h2>
            <p className="text-gray-600 mb-6">
              Click the button below to send your order to {tenant.name} via Facebook Messenger.
              You&apos;ll be redirected to Messenger with your order details pre-filled.
            </p>
            
            <Button 
              size="lg" 
              className="w-full h-14 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-full disabled:opacity-50 disabled:cursor-not-allowed" 
              onClick={handleCheckout}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-3"></div>
                  Processing Order...
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
    </div>
  )
}

