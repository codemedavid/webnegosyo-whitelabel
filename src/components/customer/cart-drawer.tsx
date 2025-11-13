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
      <SheetContent className="flex w-[95%] max-w-md sm:max-w-lg flex-col bg-gradient-to-b from-gray-50 to-gray-100 p-0 max-h-screen">
        <SheetHeader className="bg-white/95 backdrop-blur-sm border-b px-4 py-2.5 flex-shrink-0" style={{ borderColor: `${branding.primary}20` }}>
          <SheetTitle className="flex items-center gap-2 text-base">
            <div 
              className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{ backgroundColor: branding.primary }}
            >
              <ShoppingCart className="h-4 w-4 text-white" />
            </div>
            <div>
              <span className="text-gray-900">Your Cart</span>
              <p className="text-xs font-normal text-gray-500">({items.length} items)</p>
            </div>
          </SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-6 min-h-[300px]">
            <EmptyState
              icon={ShoppingCart}
              title="Your cart is empty"
              description="Add some delicious items to get started"
            />
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-hidden min-h-0">
              <ScrollArea className="h-full px-4">
                <div className="space-y-2.5 py-3">
                  {items.map((item) => (
                    <div key={item.id} className="group flex gap-2.5 rounded-lg bg-white p-2.5 shadow-sm border border-gray-100">
                      <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                        <Image
                          src={item.menu_item.image_url}
                          alt={item.menu_item.name}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform"
                          sizes="56px"
                        />
                      </div>

                      <div className="flex flex-1 flex-col min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-0.5">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-xs line-clamp-2 text-gray-900 leading-snug">
                              {item.menu_item.name}
                            </h4>
                          
                          {/* Legacy single variation */}
                          {item.selected_variation && (
                            <Badge 
                              variant="outline" 
                              className="mt-0.5 text-[10px] py-0 px-1.5 h-4"
                              style={{ 
                                borderColor: `${branding.primary}40`,
                                color: branding.primary,
                                backgroundColor: `${branding.primary}10`
                              }}
                            >
                              {item.selected_variation.name}
                            </Badge>
                          )}
                          
                          {/* New grouped variations */}
                          {item.selected_variations && Object.keys(item.selected_variations).length > 0 && (
                            <div className="flex flex-wrap gap-0.5 mt-0.5">
                              {Object.values(item.selected_variations).map((option, idx) => (
                                <Badge 
                                  key={idx}
                                  variant="outline" 
                                  className="text-[10px] py-0 px-1.5 h-4"
                                  style={{ 
                                    borderColor: `${branding.primary}40`,
                                    color: branding.primary,
                                    backgroundColor: `${branding.primary}10`
                                  }}
                                >
                                  {option.name}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 active:scale-95 md:opacity-0 md:group-hover:opacity-100 transition-all flex-shrink-0"
                          onClick={() => removeItem(item.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      {(item.selected_addons.length > 0 || item.special_instructions) && (
                        <div className="text-[10px] text-gray-500 mb-1 space-y-0.5">
                          {item.selected_addons.length > 0 && (
                            <p className="line-clamp-1">
                              <span className="font-medium">Add-ons:</span> {item.selected_addons.map((a) => a.name).join(', ')}
                            </p>
                          )}
                          {item.special_instructions && (
                            <p className="italic line-clamp-1">
                              <span className="font-medium">Note:</span> {item.special_instructions}
                            </p>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between mt-auto">
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7 rounded-full hover:bg-orange-50 active:scale-95 border-gray-200 transition-transform"
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            disabled={item.quantity <= 1}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-7 text-center text-sm font-bold text-gray-900">
                            {item.quantity}
                          </span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7 rounded-full hover:bg-orange-50 active:scale-95 border-gray-200 transition-transform"
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <span className="font-bold text-xs" style={{ color: branding.primary }}>
                          {formatPrice(item.subtotal)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            </div>

            <div 
              className="bg-white/95 backdrop-blur-sm border-t px-4 py-2.5 space-y-2 flex-shrink-0" 
              style={{ 
                borderColor: `${branding.primary}20`,
                paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom, 0.625rem))'
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-gray-900">Total</span>
                <span className="text-base font-bold" style={{ color: branding.primary }}>{formatPrice(total)}</span>
              </div>

              <div className="flex flex-col gap-2">
                <Link href={`/${tenantSlug}/checkout`} className="w-full" onClick={onClose}>
                  <Button 
                    className="w-full h-10 text-white font-bold rounded-lg shadow-sm transition-all hover:opacity-90 active:scale-[0.98]"
                    style={{ backgroundColor: branding.primary }}
                  >
                    Proceed to Checkout
                  </Button>
                </Link>
                <Link href={`/${tenantSlug}/cart`} className="w-full" onClick={onClose}>
                  <Button 
                    variant="outline" 
                    className="w-full h-9 border-2 rounded-lg font-semibold transition-all active:scale-[0.98]"
                    style={{ 
                      borderColor: `${branding.primary}40`,
                      color: branding.primary
                    }}
                  >
                    Review Cart
                  </Button>
                </Link>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

