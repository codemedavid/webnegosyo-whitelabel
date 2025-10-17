'use client'

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Minus, Plus, Trash2, ArrowLeft, ShoppingBag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'
import { useCart } from '@/hooks/useCart'
import { formatPrice } from '@/lib/cart-utils'
import { getTenantBySlug } from '@/lib/mockData'

export default function CartPage() {
  const params = useParams()
  const router = useRouter()
  const tenantSlug = params.tenant as string
  const { items, total, updateQuantity, removeItem } = useCart()

  const tenant = getTenantBySlug(tenantSlug)

  if (!tenant) {
    return <div>Tenant not found</div>
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-50 border-b bg-background">
        <div className="container flex h-16 items-center gap-4 px-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">Your Cart</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {items.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <EmptyState
                icon={ShoppingBag}
                title="Your cart is empty"
                description="Add some items from the menu to get started"
                actionLabel="Browse Menu"
                onAction={() => router.push(`/${tenantSlug}/menu`)}
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              {items.map((item) => (
                <Card key={item.id}>
                  <CardContent className="p-4">
                    <div className="flex gap-4">
                      <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-md">
                        <Image
                          src={item.menu_item.image_url}
                          alt={item.menu_item.name}
                          fill
                          className="object-cover"
                          sizes="96px"
                        />
                      </div>

                      <div className="flex flex-1 flex-col">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-semibold">{item.menu_item.name}</h3>
                            {item.selected_variation && (
                              <Badge variant="outline" className="mt-1">
                                {item.selected_variation.name}
                              </Badge>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() => removeItem(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        {item.selected_addons.length > 0 && (
                          <p className="mt-2 text-sm text-muted-foreground">
                            Add-ons: {item.selected_addons.map((a) => a.name).join(', ')}
                          </p>
                        )}

                        {item.special_instructions && (
                          <p className="mt-1 text-sm italic text-muted-foreground">
                            Note: {item.special_instructions}
                          </p>
                        )}

                        <div className="mt-4 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => updateQuantity(item.id, item.quantity - 1)}
                              disabled={item.quantity <= 1}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-12 text-center font-medium">
                              {item.quantity}
                            </span>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                          <span className="text-lg font-semibold">
                            {formatPrice(item.subtotal)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="lg:col-span-1">
              <Card className="sticky top-20">
                <CardHeader>
                  <CardTitle>Order Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Items ({items.length})</span>
                      <span>{formatPrice(total)}</span>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <span className="text-primary">{formatPrice(total)}</span>
                  </div>
                </CardContent>
                <CardFooter className="flex-col gap-2">
                  <Link href={`/${tenantSlug}/checkout`} className="w-full">
                    <Button className="w-full" size="lg">
                      Proceed to Checkout
                    </Button>
                  </Link>
                  <Link href={`/${tenantSlug}/menu`} className="w-full">
                    <Button variant="outline" className="w-full">
                      Continue Shopping
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

