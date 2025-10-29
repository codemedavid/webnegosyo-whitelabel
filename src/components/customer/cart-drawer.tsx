'use client'

import { ShoppingCart, Minus, Plus, Trash2 } from 'lucide-react'
import Image from 'next/image'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { EmptyState } from '@/components/shared/empty-state'
import { useCart } from '@/hooks/useCart'
import { formatPrice } from '@/lib/cart-utils'
import type { BrandingColors } from '@/lib/branding-utils'
import Link from 'next/link'

interface CartDrawerProps {
  open: boolean
  onClose: () => void
  tenantSlug: string
  branding: BrandingColors
}

export function CartDrawer({ open, onClose, tenantSlug, branding }: CartDrawerProps) {
  const { items, total, updateQuantity, removeItem } = useCart()

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="flex w-full flex-col sm:max-w-lg bg-gradient-to-b from-gray-50 to-gray-100">
        <SheetHeader className="bg-white/95 backdrop-blur-sm border-b" style={{ borderColor: `${branding.primary}20` }}>
          <SheetTitle className="flex items-center gap-3 text-xl">
            <div 
              className="flex h-10 w-10 items-center justify-center rounded-full"
              style={{ backgroundColor: branding.primary }}
            >
              <ShoppingCart className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="text-gray-900">Your Cart</span>
              <p className="text-sm font-normal text-gray-500">({items.length} items)</p>
            </div>
          </SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={ShoppingCart}
              title="Your cart is empty"
              description="Add some delicious items to get started"
            />
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-3 py-4">
                {items.map((item) => (
                  <div key={item.id} className="group flex gap-3 rounded-xl bg-white p-4 shadow-sm border border-gray-100">
                    <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                      <Image
                        src={item.menu_item.image_url}
                        alt={item.menu_item.name}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform"
                        sizes="64px"
                      />
                    </div>

                    <div className="flex flex-1 flex-col min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-sm line-clamp-1 text-gray-900">
                            {item.menu_item.name}
                          </h4>
                          {item.selected_variation && (
                            <Badge 
                              variant="outline" 
                              className="mt-1 text-xs"
                              style={{ 
                                borderColor: `${branding.primary}40`,
                                color: branding.primary,
                                backgroundColor: `${branding.primary}10`
                              }}
                            >
                              {item.selected_variation.name}
                            </Badge>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-red-500 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => removeItem(item.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>

                      {(item.selected_addons.length > 0 || item.special_instructions) && (
                        <div className="text-xs text-gray-500 mb-2">
                          {item.selected_addons.length > 0 && (
                            <p className="line-clamp-1">
                              Add-ons: {item.selected_addons.map((a) => a.name).join(', ')}
                            </p>
                          )}
                          {item.special_instructions && (
                            <p className="italic line-clamp-1">
                              Note: {item.special_instructions}
                            </p>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7 rounded-full hover:bg-orange-50 border-gray-200"
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            disabled={item.quantity <= 1}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-6 text-center text-sm font-bold text-gray-900">
                            {item.quantity}
                          </span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7 rounded-full hover:bg-orange-50 border-gray-200"
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <span className="font-bold text-sm" style={{ color: branding.primary }}>
                          {formatPrice(item.subtotal)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="bg-white/95 backdrop-blur-sm border-t p-6 space-y-4" style={{ borderColor: `${branding.primary}20` }}>
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-gray-900">Total</span>
                <span className="text-xl font-bold" style={{ color: branding.primary }}>{formatPrice(total)}</span>
              </div>

              <div className="flex flex-col gap-3">
                <Link href={`/${tenantSlug}/cart`} className="w-full" onClick={onClose}>
                  <Button 
                    variant="outline" 
                    className="w-full h-12 border-2 border-gray-200 rounded-xl font-semibold transition-colors"
                    style={{ 
                      borderColor: `${branding.primary}40`
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = `${branding.primary}10`
                      e.currentTarget.style.borderColor = `${branding.primary}60`
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                      e.currentTarget.style.borderColor = `${branding.primary}40`
                    }}
                  >
                    Review Cart
                  </Button>
                </Link>
                <Link href={`/${tenantSlug}/checkout`} className="w-full" onClick={onClose}>
                  <Button 
                    className="w-full h-12 text-white font-bold rounded-xl shadow-lg transition-opacity hover:opacity-90"
                    style={{ backgroundColor: branding.primary }}
                  >
                    Proceed to Checkout
                  </Button>
                </Link>
              </div>

              <div className="pt-2">
                <p className="text-xs text-center text-gray-500">
                  {items.length} item{items.length !== 1 ? 's' : ''} in cart
                </p>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

