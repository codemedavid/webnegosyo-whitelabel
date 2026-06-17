'use client'

/**
 * Classic cart design — the original two-column layout, preserved verbatim and
 * wired to the shared useCartView() hook. Default design; must remain
 * pixel-identical to the pre-template cart. The remove dialog and upsell
 * interstitial are rendered by the page shell (shared).
 */

import Link from 'next/link'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { Minus, Plus, Trash2, ArrowLeft, ShoppingBag, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'
import { formatPrice, calculateSlotBundleSavings, calculateTotalSlotBundleSavings } from '@/lib/cart-utils'
import { getCartPalette } from '@/lib/branding-utils'
import type { UseCartViewReturn } from '@/hooks/useCartView'

export function ClassicCart({ cart }: { cart: UseCartViewReturn }) {
  const {
    router, tenantSlug, tenant,
    items, bundleItems, total,
    updateQuantity, removeBundleFromCart, updateBundleQuantity,
    setItemToRemove, handleDecreaseQuantity,
    isNavigating, requestCheckout,
  } = cart

  if (!tenant) return null

  const palette = getCartPalette(tenant, cart.branding)
  const accentColor = typeof tenant?.cart_accent_color === 'string' && tenant.cart_accent_color ? tenant.cart_accent_color : undefined

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50/30 to-orange-100/20" style={{ background: palette.background }}>
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-orange-200/30">
        <div className="container mx-auto flex h-20 items-center gap-4 px-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="hover:bg-orange-50">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900" style={{ color: palette.text }}>Your Cart</h1>
            <p className="text-sm text-gray-500" style={{ color: palette.mutedText }}>Review your delicious selection</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {items.length === 0 && bundleItems.length === 0 ? (
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
                <h2 className="text-xl md:text-2xl font-bold text-gray-900" style={{ color: palette.text }}>Cart Items</h2>
                <span className="text-sm text-gray-500" style={{ color: palette.mutedText }}>{items.length} item{items.length !== 1 ? 's' : ''}</span>
              </div>

              {items.map((item, index) => (
                <div key={item.id} className="group rounded-2xl bg-white p-4 md:p-6 shadow-sm hover:shadow-md transition-shadow border border-gray-100" style={{ backgroundColor: palette.cardBackground, borderColor: palette.border }}>
                  <div className="flex gap-4 md:gap-6">
                    <div className="relative h-20 w-20 md:h-28 md:w-28 flex-shrink-0 overflow-hidden rounded-xl bg-gray-100">
                      <OptimizedImage
                        src={item.menu_item.image_url}
                        alt={item.menu_item.name}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-200"
                        sizes="112px"
                        lazy={index > 5}
                        fetchPriority={index === 0 ? 'high' : 'auto'}
                      />
                    </div>

                    <div className="flex flex-1 flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex-1">
                            <h3 className="text-lg font-bold text-gray-900 line-clamp-1" style={{ color: palette.text }}>
                              {item.menu_item.name}
                            </h3>

                            {/* Legacy single variation */}
                            {item.selected_variation && (
                              <Badge variant="outline" className="mt-2 border-orange-200 text-orange-700 bg-orange-50">
                                {item.selected_variation.name}
                              </Badge>
                            )}

                            {/* New grouped variations */}
                            {item.selected_variations && Object.keys(item.selected_variations).length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {Object.values(item.selected_variations).map((option, idx) => (
                                  <Badge
                                    key={idx}
                                    variant="outline"
                                    className="border-orange-200 text-orange-700 bg-orange-50"
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
                            className="h-10 w-10 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-full touch-manipulation"
                            onClick={() => setItemToRemove(item)}
                          >
                            <Trash2 className="h-5 w-5" />
                          </Button>
                        </div>

                        {item.selected_addons.length > 0 && (
                          <p className="text-sm text-gray-600 mb-1" style={{ color: palette.mutedText }}>
                            <span className="font-medium">Add-ons:</span> {item.selected_addons.map((a) => a.name).join(', ')}
                          </p>
                        )}

                        {item.special_instructions && (
                          <p className="text-sm italic text-gray-500" style={{ color: palette.mutedText }}>
                            <span className="font-medium">Note:</span> {item.special_instructions}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between mt-4">
                        <div className="flex items-center gap-3">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-10 w-10 rounded-full hover:bg-orange-50 border-gray-200 hover:border-orange-300 touch-manipulation"
                            onClick={() => handleDecreaseQuantity(item)}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span className="w-12 text-center font-bold text-lg text-gray-900" style={{ color: palette.text }}>
                            {item.quantity}
                          </span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-10 w-10 rounded-full hover:bg-orange-50 border-gray-200 hover:border-orange-300 touch-manipulation"
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="text-right">
                          <span className="text-xl font-bold text-orange-600" style={{ color: accentColor }}>
                            {formatPrice(item.subtotal)}
                          </span>
                          {item.quantity > 1 && (
                            <p className="text-xs text-gray-500" style={{ color: palette.mutedText }}>
                              {formatPrice(item.subtotal / item.quantity)} each
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Bundle Items */}
              {bundleItems.filter(bi => Array.isArray(bi.slots)).map((bundleItem) => {
                const savings = calculateSlotBundleSavings(bundleItem)
                const originalTotal = bundleItem.slots.reduce(
                  (sum, s) => sum + s.menuItemPrice * s.quantity, 0
                )

                return (
                  <div key={bundleItem.id} className="group rounded-2xl bg-white p-4 md:p-6 shadow-sm border border-orange-100" style={{ backgroundColor: palette.cardBackground, borderColor: palette.border }}>
                    {/* Bundle header */}
                    <div className="flex items-center gap-2 mb-3">
                      <Package className="h-4 w-4 text-orange-500" style={{ color: accentColor }} />
                      <span className="font-bold text-gray-900" style={{ color: palette.text }}>{bundleItem.bundleName}</span>
                      {savings > 0 && (
                        <Badge className="bg-green-100 text-green-700 text-xs">
                          Save {formatPrice(savings)}
                        </Badge>
                      )}
                    </div>

                    {/* Bundle slots list */}
                    <div className="space-y-2 mb-3 pl-6 border-l-2 border-orange-100">
                      {bundleItem.slots.map((slot, idx) => (
                        <div key={idx} className="text-sm">
                          <span className="font-medium text-gray-800" style={{ color: palette.text }}>
                            {slot.quantity > 1 ? `${slot.quantity}x ` : ''}{slot.menuItemName}
                          </span>
                          {slot.selectedVariations && Object.values(slot.selectedVariations).length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {Object.values(slot.selectedVariations).map((opt, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">
                                  {opt.name}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {slot.selectedVariation && (
                            <Badge variant="secondary" className="text-xs mt-0.5">
                              {slot.selectedVariation.name}
                            </Badge>
                          )}
                          {slot.selectedAddons.length > 0 && (
                            <p className="text-xs text-gray-500 mt-0.5" style={{ color: palette.mutedText }}>
                              + {slot.selectedAddons.map(a => a.name).join(', ')}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Bundle pricing and controls */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 bg-gray-50 rounded-full px-2 py-1">
                          <button onClick={() => updateBundleQuantity(bundleItem.id, bundleItem.quantity - 1)}
                            className="p-1 rounded-full hover:bg-gray-200 transition-colors">
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="text-sm font-semibold w-6 text-center">{bundleItem.quantity}</span>
                          <button onClick={() => updateBundleQuantity(bundleItem.id, bundleItem.quantity + 1)}
                            className="p-1 rounded-full hover:bg-gray-200 transition-colors">
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <button onClick={() => removeBundleFromCart(bundleItem.id)}
                          className="p-1.5 rounded-full text-red-400 hover:bg-red-50 transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="text-right">
                        {savings > 0 && (
                          <span className="text-xs text-gray-400 line-through block">
                            {formatPrice(originalTotal * bundleItem.quantity)}
                          </span>
                        )}
                        <span className="font-bold text-orange-600" style={{ color: accentColor }}>
                          {formatPrice(bundleItem.subtotal)}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="lg:col-span-1">
              <div className="sticky top-20 rounded-2xl bg-white p-6 md:p-8 shadow-lg border border-gray-100" style={{ backgroundColor: palette.summaryBackground, borderColor: palette.border }}>
                <div className="flex items-center gap-3 mb-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100">
                    <span className="text-orange-600 font-bold" style={{ color: accentColor }}>₱</span>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900" style={{ color: palette.text }}>Order Summary</h3>
                </div>

                <div className="space-y-4 mb-8">
                  <div className="flex justify-between items-center py-2">
                    <span className="text-gray-600" style={{ color: palette.mutedText }}>Items ({items.length})</span>
                    <span className="font-semibold text-gray-900" style={{ color: palette.text }}>{formatPrice(total)}</span>
                  </div>

                  {calculateTotalSlotBundleSavings(bundleItems) > 0 && (
                    <div className="flex justify-between items-center text-green-600 text-sm">
                      <span>Bundle savings</span>
                      <span>-{formatPrice(calculateTotalSlotBundleSavings(bundleItems))}</span>
                    </div>
                  )}

                  <div className="border-t border-gray-200 pt-4" style={{ borderColor: palette.border }}>
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-bold text-gray-900" style={{ color: palette.text }}>Total</span>
                      <span className="text-2xl font-bold text-orange-600" style={{ color: accentColor }}>{formatPrice(total)}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <Button
                    className="w-full h-14 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: palette.button, color: palette.button ? palette.accentText : undefined }}
                    onClick={requestCheckout}
                    disabled={isNavigating}
                  >
                    {isNavigating ? (
                      <>
                        <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-3"></div>
                        <span className="text-lg">Loading...</span>
                      </>
                    ) : (
                      <span className="text-lg">Proceed to Checkout</span>
                    )}
                  </Button>
                  <Link href={`/${tenantSlug}/menu`} className="w-full">
                    <Button variant="outline" className="w-full h-12 border-2 border-gray-200 hover:bg-orange-50 hover:border-orange-200 rounded-xl font-semibold">
                      Continue Shopping
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
