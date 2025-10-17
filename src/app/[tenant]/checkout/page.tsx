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
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-50 border-b bg-background">
        <div className="container flex h-16 items-center gap-4 px-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">Checkout</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-2xl space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
              <CardDescription>Review your order before checkout</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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

              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span className="text-primary">{formatPrice(total)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                Complete Order via Messenger
              </CardTitle>
              <CardDescription>
                Click the button below to send your order to {tenant.name} via Facebook Messenger.
                You&apos;ll be redirected to Messenger with your order details pre-filled.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button size="lg" className="w-full" onClick={handleCheckout}>
                <MessageCircle className="mr-2 h-5 w-5" />
                Send Order via Messenger
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Your order will be sent to the restaurant for confirmation
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

