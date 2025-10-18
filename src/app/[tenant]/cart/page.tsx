'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Minus, Plus, Trash2, ArrowLeft, ShoppingBag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'
import { useCart } from '@/hooks/useCart'
import { formatPrice } from '@/lib/cart-utils'
import { getTenantBySlugSupabase } from '@/lib/tenants-service'
import { toast } from 'sonner'
import type { Tenant } from '@/types/database'

export default function CartPage() {
  const params = useParams()
  const router = useRouter()
  const tenantSlug = params.tenant as string
  const { items, total, updateQuantity, removeItem } = useCart()

  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [isLoading, setIsLoading] = useState(true)

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
      } catch {
        toast.error('Failed to load restaurant')
        router.push('/')
      } finally {
        setIsLoading(false)
      }
    }

    loadTenant()
  }, [tenantSlug, router])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-orange-50/30 to-orange-100/20 flex items-center justify-center">
        <div className="text-center">
          <div className="h-16 w-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading cart...</p>
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
            <h1 className="text-2xl font-bold text-gray-900">Your Cart</h1>
            <p className="text-sm text-gray-500">Review your delicious selection</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {items.length === 0 ? (
          <div className="flex min-h-[60vh] items-center justify-center">
            <div className="rounded-3xl bg-white p-16 shadow-lg text-center max-w-md">
              <EmptyState
                icon={ShoppingBag}
                title="Your cart is empty"
                description="Add some items from the menu to get started"
                actionLabel="Browse Menu"
                onAction={() => router.push(`/${tenantSlug}/menu`)}
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl md:text-2xl font-bold text-gray-900">Cart Items</h2>
                <span className="text-sm text-gray-500">{items.length} item{items.length !== 1 ? 's' : ''}</span>
              </div>
              
              {items.map((item) => (
                <div key={item.id} className="group rounded-2xl bg-white p-4 md:p-6 shadow-sm hover:shadow-md transition-shadow border border-gray-100">
                  <div className="flex gap-4 md:gap-6">
                      <div className="relative h-20 w-20 md:h-28 md:w-28 flex-shrink-0 overflow-hidden rounded-xl bg-gray-100">
                        <Image
                          src={item.menu_item.image_url}
                          alt={item.menu_item.name}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-200"
                          sizes="112px"
                        />
                      </div>

                      <div className="flex flex-1 flex-col justify-between">
                        <div>
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="flex-1">
                              <h3 className="text-lg font-bold text-gray-900 line-clamp-1">
                                {item.menu_item.name}
                              </h3>
                              {item.selected_variation && (
                                <Badge variant="outline" className="mt-2 border-orange-200 text-orange-700 bg-orange-50">
                                  {item.selected_variation.name}
                                </Badge>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-500 hover:text-red-600 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => removeItem(item.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>

                          {item.selected_addons.length > 0 && (
                            <p className="text-sm text-gray-600 mb-1">
                              <span className="font-medium">Add-ons:</span> {item.selected_addons.map((a) => a.name).join(', ')}
                            </p>
                          )}

                          {item.special_instructions && (
                            <p className="text-sm italic text-gray-500">
                              <span className="font-medium">Note:</span> {item.special_instructions}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center justify-between mt-4">
                          <div className="flex items-center gap-3">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-10 w-10 rounded-full hover:bg-orange-50 border-gray-200 hover:border-orange-300"
                              onClick={() => updateQuantity(item.id, item.quantity - 1)}
                              disabled={item.quantity <= 1}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-12 text-center font-bold text-lg text-gray-900">
                              {item.quantity}
                            </span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-10 w-10 rounded-full hover:bg-orange-50 border-gray-200 hover:border-orange-300"
                              onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="text-right">
                            <span className="text-xl font-bold text-orange-600">
                              {formatPrice(item.subtotal)}
                            </span>
                            {item.quantity > 1 && (
                              <p className="text-xs text-gray-500">
                                {formatPrice(item.subtotal / item.quantity)} each
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
              ))}
            </div>

            <div className="lg:col-span-1">
              <div className="sticky top-20 rounded-2xl bg-white p-6 md:p-8 shadow-lg border border-gray-100">
                <div className="flex items-center gap-3 mb-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100">
                    <span className="text-orange-600 font-bold">₱</span>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Order Summary</h3>
                </div>
                
                <div className="space-y-4 mb-8">
                  <div className="flex justify-between items-center py-2">
                    <span className="text-gray-600">Items ({items.length})</span>
                    <span className="font-semibold text-gray-900">{formatPrice(total)}</span>
                  </div>

                  <div className="border-t border-gray-200 pt-4">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-bold text-gray-900">Total</span>
                      <span className="text-2xl font-bold text-orange-600">{formatPrice(total)}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <Link href={`/${tenantSlug}/checkout`} className="w-full">
                    <Button className="w-full h-14 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all">
                      <span className="text-lg">Proceed to Checkout</span>
                    </Button>
                  </Link>
                  <Link href={`/${tenantSlug}/menu`} className="w-full">
                    <Button variant="outline" className="w-full h-12 border-2 border-gray-200 hover:bg-orange-50 hover:border-orange-200 rounded-xl font-semibold">
                      Continue Shopping
                    </Button>
                  </Link>
                </div>

                <div className="mt-6 p-4 bg-orange-50 rounded-xl">
                  <p className="text-sm text-orange-700 text-center">
                    🚚 Free delivery on orders over ₱500
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

