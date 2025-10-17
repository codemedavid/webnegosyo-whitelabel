'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { ArrowLeft, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useCart } from '@/hooks/useCart'
import { formatPrice, generateMessengerMessage, generateMessengerUrl } from '@/lib/cart-utils'
import { getTenantBySlug } from '@/lib/mockData'
import { toast } from 'sonner'

export default function CheckoutPage() {
  const params = useParams()
  const router = useRouter()
  const tenantSlug = params.tenant as string
  const { items, total, clearCart } = useCart()

  const tenant = getTenantBySlug(tenantSlug)

  useEffect(() => {
    if (items.length === 0) {
      router.push(`/${tenantSlug}/menu`)
    }
  }, [items.length, router, tenantSlug])

  if (!tenant) {
    return <div>Tenant not found</div>
  }

  const handleCheckout = () => {
    const message = generateMessengerMessage(items, tenant.name)
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
              className="w-full h-14 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-full" 
              onClick={handleCheckout}
            >
              <MessageCircle className="mr-3 h-6 w-6" />
              Send Order via Messenger
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

