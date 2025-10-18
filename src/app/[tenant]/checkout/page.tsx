'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ArrowLeft, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useCart } from '@/hooks/useCart'
import { formatPrice, generateMessengerMessage, generateMessengerUrl } from '@/lib/cart-utils'
import { createClient } from '@/lib/supabase/client'
import { getTenantBySlugSupabase } from '@/lib/tenants-service'
import { createOrderAction } from '@/app/actions/orders'
import { toast } from 'sonner'
import type { Tenant } from '@/types/database'

export default function CheckoutPage() {
  const params = useParams()
  const router = useRouter()
  const tenantSlug = params.tenant as string
  const { items, total, clearCart } = useCart()

  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)

  // Load tenant data from Supabase
  useEffect(() => {
    const loadTenant = async () => {
      try {
        const { data, error } = await getTenantBySlugSupabase(tenantSlug)
        if (error || !data) {
          toast.error('Restaurant not found')
          router.push('/')
          return
        }
        setTenant(data)
      } catch (error) {
        toast.error('Failed to load restaurant')
        router.push('/')
      } finally {
        setIsLoading(false)
      }
    }

    loadTenant()
  }, [tenantSlug, router])

  // Redirect to menu if cart is empty
  useEffect(() => {
    if (!isLoading && items.length === 0) {
      router.push(`/${tenantSlug}/menu`)
    }
  }, [items.length, router, tenantSlug, isLoading])

  const handleCheckout = async () => {
    if (!tenant || isProcessing) return

    setIsProcessing(true)

    try {
      // Create order in database
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

      const result = await createOrderAction(tenant.id, orderItems)

      if (!result.success) {
        toast.error('Failed to create order. Please try again.')
        setIsProcessing(false)
        return
      }

      // Generate messenger message and URL
      const message = generateMessengerMessage(items, tenant.name)
      const messengerUrl = generateMessengerUrl(
        tenant.messenger_username || tenant.messenger_page_id,
        message,
        !tenant.messenger_username
      )

      // Clear cart
      clearCart()

      // Show success message
      toast.success('Order created! Redirecting to Messenger...')

      // Redirect to Messenger
      setTimeout(() => {
        window.location.href = messengerUrl
      }, 1000)
    } catch (error) {
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
        <div className="mx-auto max-w-2xl space-y-8">
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

              <div className="flex justify-between text-xl font-bold pt-4 border-t">
                <span>Total</span>
                <span className="text-orange-600">{formatPrice(total)}</span>
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

