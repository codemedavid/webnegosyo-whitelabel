'use client'

/**
 * Classic cart design — the original two-column layout wired to the shared
 * useCartView() hook. Default design. Every colour comes from the cart palette
 * (getCartColors), which inherits the store's brand, so a store that never set
 * cart colours gets a clean light cart and a dark store gets a dark one. The
 * remove dialog and upsell interstitial are rendered by the page shell.
 */

import { StoreLabel } from '@/components/customer/storefront-labels-provider'
import { addonLabel, addonPriceList } from '@/lib/addon-quantity'
import { formatPresellDateLabel } from '@/lib/presell/month-grid'
import Link from 'next/link'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { Minus, Plus, Trash2, Pencil, ArrowLeft, ShoppingBag, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatPrice, calculateSlotBundleSavings, calculateTotalSlotBundleSavings } from '@/lib/cart-utils'
import { useSeniorMode } from '@/components/customer/senior-mode/senior-mode-provider'
import type { UseCartViewReturn } from '@/hooks/useCartView'
import { CartOffers } from './cart-shared'
import { CartEmptyPanel, cartColorVars, getCartColors } from './cart-primitives'

export function ClassicCart({ cart }: { cart: UseCartViewReturn }) {
  const {
    router, tenantSlug, tenant,
    items, bundleItems, total,
    updateQuantity, removeBundleFromCart, updateBundleQuantity,
    setItemToRemove, setItemToEdit, handleDecreaseQuantity, canIncreaseItem, presellHintFor,
    isNavigating, requestCheckout, exitToMenu,
  } = cart
  // Senior mode's larger text gets a second line for long dish names.
  const isSeniorMode = useSeniorMode()

  if (!tenant) return null

  const palette = getCartColors(tenant, cart.branding)
  const accentColor = palette.accent
  // Outline/ghost controls: palette border + text, accent-tinted hover.
  const outlineControl = { borderColor: palette.border, color: palette.text }

  return (
    <div className="min-h-screen" style={{ ...cartColorVars(palette), background: palette.background }}>
      <header data-senior-hidden className="sticky top-0 z-50 backdrop-blur-sm border-b" style={{ backgroundColor: palette.card, borderColor: palette.border }}>
        <div className="container mx-auto flex h-20 items-center gap-4 px-4">
          <Button variant="ghost" size="icon" onClick={exitToMenu} aria-label="Back to menu" className="hover:bg-[var(--cart-soft)]" style={{ color: palette.text }}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: palette.text }}><StoreLabel name="cart.title" fallback="Your Cart" /></h1>
            <p className="text-sm" style={{ color: palette.muted }}>Review your delicious selection</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {items.length === 0 && bundleItems.length === 0 ? (
          <div className="flex min-h-[60vh] items-center justify-center">
            <div className="rounded-3xl p-16 shadow-lg text-center max-w-md" style={{ backgroundColor: palette.card }}>
              <CartEmptyPanel
                colors={palette}
                icon={ShoppingBag}
                title={<StoreLabel name="cart.empty" fallback="Your cart is empty" />}
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
                <h2 className="text-xl md:text-2xl font-bold" style={{ color: palette.text }}>Cart Items</h2>
                <span className="text-sm" style={{ color: palette.muted }}>{items.length} item{items.length !== 1 ? 's' : ''}</span>
              </div>

              {items.map((item, index) => (
                <div key={item.id} data-branding-scope="cart/item" className="group rounded-2xl p-4 md:p-6 shadow-sm hover:shadow-md transition-shadow border" style={{ backgroundColor: palette.card, borderColor: palette.border }}>
                  <div className="flex gap-4 md:gap-6">
                    <div className="relative h-20 w-20 md:h-28 md:w-28 flex-shrink-0 overflow-hidden rounded-xl" style={{ backgroundColor: palette.accentSoft }}>
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
                            <h3 className={`text-lg font-bold ${isSeniorMode ? 'line-clamp-2' : 'line-clamp-1'}`} style={{ color: palette.text }}>
                              {item.menu_item.name}
                            </h3>

                            {/* Legacy single variation */}
                            {item.selected_variation && (
                              <Badge variant="outline" className="mt-2" style={{ borderColor: palette.accentBorder, color: palette.accent, backgroundColor: palette.accentSoft }}>
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
                                    style={{ borderColor: palette.accentBorder, color: palette.accent, backgroundColor: palette.accentSoft }}
                                  >
                                    {option.name}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center">
                            {((item.menu_item.variation_types?.length ?? 0) > 0 || item.menu_item.variations.length > 0 || item.menu_item.addons.length > 0) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-10 w-10 hover:bg-[var(--cart-soft)] rounded-full touch-manipulation"
                                style={{ color: palette.muted }}
                                onClick={() => setItemToEdit(item)}
                                aria-label="Edit item"
                              >
                                <Pencil className="h-4.5 w-4.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-10 w-10 hover:bg-[var(--cart-danger-soft)] rounded-full touch-manipulation"
                              style={{ color: palette.danger }}
                              onClick={() => setItemToRemove(item)}
                              aria-label="Remove item"
                            >
                              <Trash2 className="h-5 w-5" />
                            </Button>
                          </div>
                        </div>

                        {item.selected_addons.length > 0 && (
                          <p className="text-sm mb-1" style={{ color: palette.muted }}>
                            <span className="font-medium">Add-ons:</span> {addonPriceList(item.selected_addons, formatPrice)}
                          </p>
                        )}

                        {item.special_instructions && (
                          <p className="text-sm italic" style={{ color: palette.muted }}>
                            <span className="font-medium">Note:</span> {item.special_instructions}
                          </p>
                        )}
                        {item.presell_date && (
                          <p className="text-sm" style={{ color: palette.accent }}>
                            <span className="font-medium">Pre-order for:</span> {formatPresellDateLabel(item.presell_date)}
                            {presellHintFor(item) && <span className="ml-2 text-xs" style={{ color: palette.muted }}>{presellHintFor(item)}</span>}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-y-2 mt-4">
                        <div className="flex items-center gap-3">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-10 w-10 rounded-full bg-transparent hover:bg-[var(--cart-soft)] hover:!border-[var(--cart-accent-border)] touch-manipulation"
                            style={outlineControl}
                            onClick={() => handleDecreaseQuantity(item)}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span className="w-12 text-center font-bold text-lg" style={{ color: palette.text }}>
                            {item.quantity}
                          </span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-10 w-10 rounded-full bg-transparent hover:bg-[var(--cart-soft)] hover:!border-[var(--cart-accent-border)] touch-manipulation"
                            style={outlineControl}
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            disabled={!canIncreaseItem(item)}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="ml-auto text-right">
                          <span data-branding-scope="cart/item-price" className="text-xl font-bold" style={{ color: accentColor }}>
                            {formatPrice(item.subtotal)}
                          </span>
                          {item.quantity > 1 && (
                            <p className="text-xs" style={{ color: palette.muted }}>
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
                  <div key={bundleItem.id} data-branding-scope="cart/item" className="group rounded-2xl p-4 md:p-6 shadow-sm border" style={{ backgroundColor: palette.card, borderColor: palette.border }}>
                    {/* Bundle header */}
                    <div className="flex items-center gap-2 mb-3">
                      <Package className="h-4 w-4" style={{ color: accentColor }} />
                      <span className="font-bold" style={{ color: palette.text }}>{bundleItem.bundleName}</span>
                      {savings > 0 && (
                        <Badge className="text-xs border-transparent" style={{ backgroundColor: palette.successSoft, color: palette.success }}>
                          Save {formatPrice(savings)}
                        </Badge>
                      )}
                    </div>

                    {/* Bundle slots list */}
                    <div className="space-y-2 mb-3 pl-6 border-l-2" style={{ borderColor: palette.accentSoft }}>
                      {bundleItem.slots.map((slot, idx) => (
                        <div key={idx} className="text-sm">
                          <span className="font-medium" style={{ color: palette.text }}>
                            {slot.quantity > 1 ? `${slot.quantity}x ` : ''}{slot.menuItemName}
                          </span>
                          {slot.selectedVariations && Object.values(slot.selectedVariations).length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {Object.values(slot.selectedVariations).map((opt, i) => (
                                <Badge key={i} variant="secondary" className="text-xs" style={{ backgroundColor: palette.accentSoft, color: palette.muted }}>
                                  {opt.name}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {slot.selectedVariation && (
                            <Badge variant="secondary" className="text-xs mt-0.5" style={{ backgroundColor: palette.accentSoft, color: palette.muted }}>
                              {slot.selectedVariation.name}
                            </Badge>
                          )}
                          {slot.selectedAddons.length > 0 && (
                            <p className="text-xs mt-0.5" style={{ color: palette.muted }}>
                              + {slot.selectedAddons.map(addonLabel).join(', ')}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Bundle pricing and controls */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 rounded-full px-2 py-1" style={{ backgroundColor: palette.accentSoft, color: palette.text }}>
                          <button onClick={() => updateBundleQuantity(bundleItem.id, bundleItem.quantity - 1)}
                            className="p-1 rounded-full hover:bg-[var(--cart-soft)] transition-colors" aria-label="Decrease quantity">
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="text-sm font-semibold w-6 text-center">{bundleItem.quantity}</span>
                          <button onClick={() => updateBundleQuantity(bundleItem.id, bundleItem.quantity + 1)}
                            className="p-1 rounded-full hover:bg-[var(--cart-soft)] transition-colors" aria-label="Increase quantity">
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <button onClick={() => removeBundleFromCart(bundleItem.id)}
                          className="p-1.5 rounded-full hover:bg-[var(--cart-danger-soft)] transition-colors" style={{ color: palette.danger }} aria-label="Remove bundle">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="text-right">
                        {savings > 0 && (
                          <span className="text-xs line-through block" style={{ color: palette.muted }}>
                            {formatPrice(originalTotal * bundleItem.quantity)}
                          </span>
                        )}
                        <span data-branding-scope="cart/item-price" className="font-bold" style={{ color: accentColor }}>
                          {formatPrice(bundleItem.subtotal)}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
              <CartOffers cart={cart} className="pt-2" />
            </div>

            <div className="lg:col-span-1">
              <div data-branding-scope="cart/summary" className="sticky top-20 rounded-2xl p-6 md:p-8 shadow-lg border" style={{ backgroundColor: palette.summary, borderColor: palette.border }}>
                <div className="flex items-center gap-3 mb-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: palette.accentSoft }}>
                    <span className="font-bold" style={{ color: accentColor }}>₱</span>
                  </div>
                  <h3 className="text-xl font-bold" style={{ color: palette.text }}>Order Summary</h3>
                </div>

                <div className="space-y-4 mb-8">
                  <div className="flex justify-between items-center py-2">
                    <span style={{ color: palette.muted }}>Items ({items.length})</span>
                    <span className="font-semibold" style={{ color: palette.text }}>{formatPrice(total)}</span>
                  </div>

                  {calculateTotalSlotBundleSavings(bundleItems) > 0 && (
                    <div className="flex justify-between items-center text-sm" style={{ color: palette.success }}>
                      <span>Bundle savings</span>
                      <span>-{formatPrice(calculateTotalSlotBundleSavings(bundleItems))}</span>
                    </div>
                  )}

                  <div className="border-t pt-4" style={{ borderColor: palette.border }}>
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-bold" style={{ color: palette.text }}><StoreLabel name="cart.total" fallback="Total" /></span>
                      <span className="text-2xl font-bold" style={{ color: accentColor }}>{formatPrice(total)}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <Button
                    data-branding-scope="cart/checkout-button"
                    className="w-full h-14 font-bold rounded-xl shadow-lg hover:shadow-xl hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: palette.button, color: palette.buttonText }}
                    onClick={requestCheckout}
                    disabled={isNavigating}
                  >
                    {isNavigating ? (
                      <>
                        <div className="h-5 w-5 border-2 border-current border-t-transparent rounded-full animate-spin mr-3"></div>
                        <span className="text-lg">Loading...</span>
                      </>
                    ) : (
                      <span className="text-lg"><StoreLabel name="cart.checkout" fallback="Proceed to Checkout" /></span>
                    )}
                  </Button>
                  <Link href={`/${tenantSlug}/menu`} className="w-full">
                    <Button variant="outline" className="w-full h-12 border-2 bg-transparent hover:bg-[var(--cart-soft)] hover:!border-[var(--cart-accent-border)] rounded-xl font-semibold" style={outlineControl}>
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
