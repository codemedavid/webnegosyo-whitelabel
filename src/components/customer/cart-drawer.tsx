'use client'

import { StoreLabel } from '@/components/customer/storefront-labels-provider'
import { addonPriceList } from '@/lib/addon-quantity'
import { formatPresellDateLabel } from '@/lib/presell/month-grid'
import { useCartCommands } from '@/storefront/cart/use-cart-commands'
import { useCartCheckout } from '@/storefront/cart/use-cart-checkout'
import { ShoppingCart, Minus, Plus, Trash2, Pencil, Package, ArrowLeft } from 'lucide-react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useCart } from '@/hooks/useCart'
import { formatPrice } from '@/lib/cart-utils'
import { CartOffersSection } from '@/components/customer/offers/cart-offers-section'
import { cartOfferThemeFromBranding } from '@/components/customer/offers/offer-theme'
import { ItemDetailModal } from '@/components/customer/item-detail-modal'
import { type BrandingColors } from '@/lib/branding-utils'
import { CartEmptyPanel, cartColorVars, getCartColors } from '@/components/customer/cart-templates/cart-primitives'
import type { Tenant } from '@/types/database'
import Link from 'next/link'

interface CartDrawerProps {
  open: boolean
  onClose: () => void
  tenantSlug: string
  branding: BrandingColors
  /** Full tenant row — used to resolve the cart page palette (cart_* overrides). */
  tenant?: Tenant | null
  tenantId?: string
  menuEngineeringEnabled?: boolean
  checkoutUpsellEnabled?: boolean
  checkoutUpsellTitle?: string
  checkoutUpsellSubtitle?: string
  checkoutUpsellMaxItems?: number
}

export function CartDrawer({
  open,
  onClose,
  tenantSlug,
  branding,
  tenant,
  tenantId,
  menuEngineeringEnabled,
  checkoutUpsellEnabled,
  checkoutUpsellTitle = 'Add to your order',
  checkoutUpsellSubtitle,
  checkoutUpsellMaxItems = 4,
}: CartDrawerProps) {
  // Cart page palette: every field is resolved (blank cart_* colours inherit
  // the store's brand), so every surface, text, border and control below
  // paints from it — a dark store gets a dark drawer, a default store a light one.
  const palette = getCartColors(tenant ?? null, branding)
  const accent = palette.accent
  const badgeStyle = { borderColor: palette.accentBorder, color: accent, backgroundColor: palette.accentSoft }
  const outlineControl = { borderColor: palette.border, color: palette.text }
  const dialogStyle = { ...cartColorVars(palette), backgroundColor: palette.card, borderColor: palette.border, color: palette.text }
  const dangerAction = { backgroundColor: palette.danger, color: palette.dangerText }
  const cart = useCart()
  const { items, total, updateQuantity, bundleItems, updateBundleQuantity } = cart
  const {
    canIncreaseItem, presellHintFor, itemToRemove, setItemToRemove, itemToEdit, setItemToEdit,
    bundleToRemove, setBundleToRemove, handleDecreaseQuantity, handleConfirmRemove,
    handleCancelRemove, handleUpdateItem, handleDecreaseBundleQuantity, handleConfirmBundleRemove,
  } = useCartCommands({ tenantId: tenant?.id ?? tenantId, cart })
  const {
    showCartOffers, cartOfferItems, cartOfferMaxItems, requestCheckout: handleCheckoutClick,
  } = useCartCheckout({
    tenant, tenantSlug, tenantId: tenant?.id ?? tenantId, items,
    hasItems: items.length + bundleItems.length > 0, enabled: open,
    menuEngineeringEnabled, checkoutUpsellEnabled, checkoutUpsellMaxItems,
    onCheckoutStart: onClose,
  })

  return (
    <>
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent hideCloseButton data-branding-scope="cart/colors" className="flex w-full flex-col sm:max-w-lg p-0 h-full" style={{ ...cartColorVars(palette), background: palette.background, color: palette.text, borderColor: palette.border }}>
          <SheetHeader className="flex-shrink-0 backdrop-blur-sm border-b px-4 py-2" style={{ backgroundColor: palette.card, borderColor: palette.border }}>
            <SheetTitle className="flex items-center gap-2 text-base">
              {/* Explicit back control: the default corner X is easy to miss on a
                  phone, so the drawer owns a labelled affordance instead. */}
              <Button
                variant="ghost"
                size="icon"
                aria-label="Back to menu"
                className="h-8 w-8 -ml-2 flex-shrink-0 hover:bg-[var(--cart-soft)] touch-manipulation"
                style={{ color: palette.text }}
                onClick={onClose}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0"
                style={{ backgroundColor: accent }}
              >
                <ShoppingCart className="h-4 w-4" style={{ color: palette.accentText }} />
              </div>
              <div>
                <span style={{ color: palette.text }}><StoreLabel name="cart.title" fallback="Your Cart" /></span>
                <p className="text-[11px] font-normal leading-tight" style={{ color: palette.muted }}>({items.length + bundleItems.length} items)</p>
              </div>
            </SheetTitle>
          </SheetHeader>

          {items.length === 0 && bundleItems.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <CartEmptyPanel
                colors={palette}
                icon={ShoppingCart}
                title={<StoreLabel name="cart.empty" fallback="Your cart is empty" />}
                description="Add some delicious items to get started"
              />
            </div>
          ) : (
            <>
              <ScrollArea className="flex-1 overflow-y-auto px-4">
                <div className="space-y-3 pt-3 pb-4">
                  {items.map((item, index) => (
                    <div key={item.id} data-branding-scope="cart/item" className="group flex gap-3 rounded-xl p-4 shadow-sm border" style={{ backgroundColor: palette.card, borderColor: palette.border }}>
                      <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg" style={{ backgroundColor: palette.accentSoft }}>
                        <OptimizedImage
                          src={item.menu_item.image_url}
                          alt={item.menu_item.name}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform"
                          sizes="64px"
                          lazy={index > 3}
                          fetchPriority={index === 0 ? 'high' : 'auto'}
                        />
                      </div>

                      <div className="flex flex-1 flex-col min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-sm line-clamp-1" style={{ color: palette.text }}>
                              {item.menu_item.name}
                            </h4>

                            {/* Legacy single variation */}
                            {item.selected_variation && (
                              <Badge
                                variant="outline"
                                className="mt-1 text-xs"
                                style={badgeStyle}
                              >
                                {item.selected_variation.name}
                              </Badge>
                            )}

                            {/* New grouped variations */}
                            {item.selected_variations && Object.keys(item.selected_variations).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {Object.values(item.selected_variations).map((option, idx) => (
                                  <Badge
                                    key={idx}
                                    variant="outline"
                                    className="text-xs"
                                    style={badgeStyle}
                                  >
                                    {option.name}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Edit item ${item.menu_item.name}`}
                              className="h-8 w-8 hover:bg-[var(--cart-soft)] touch-manipulation"
                              style={{ color: accent }}
                              onClick={() => setItemToEdit(item)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Remove item ${item.menu_item.name}`}
                              className="h-8 w-8 hover:bg-[var(--cart-danger-soft)] touch-manipulation"
                              style={{ color: palette.danger }}
                              onClick={() => setItemToRemove(item)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {item.presell_date && (
                          <p className="text-xs mb-1" style={{ color: accent }}>
                            <span className="font-medium">Pre-order for:</span> {formatPresellDateLabel(item.presell_date)}
                            {presellHintFor(item) && <span className="ml-2" style={{ color: palette.muted }}>{presellHintFor(item)}</span>}
                          </p>
                        )}
                        {(item.selected_addons.length > 0 || item.special_instructions) && (
                          <div className="text-xs mb-2 space-y-0.5" style={{ color: palette.muted }}>
                            {item.selected_addons.length > 0 && (
                              <p className="line-clamp-2">
                                <span className="font-medium">Add-ons:</span> {addonPriceList(item.selected_addons, formatPrice)}
                              </p>
                            )}
                            {item.special_instructions && (
                              <p className="italic line-clamp-1">
                                <span className="font-medium">Note:</span> {item.special_instructions}
                              </p>
                            )}
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-9 w-9 rounded-full bg-transparent hover:bg-[var(--cart-soft)] hover:!border-[var(--cart-accent-border)] touch-manipulation"
                              style={outlineControl}
                              onClick={() => handleDecreaseQuantity(item)}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-8 text-center text-sm font-bold" style={{ color: palette.text }}>
                              {item.quantity}
                            </span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-9 w-9 rounded-full bg-transparent hover:bg-[var(--cart-soft)] hover:!border-[var(--cart-accent-border)] touch-manipulation"
                              style={outlineControl}
                              onClick={() => updateQuantity(item.id, item.quantity + 1)}
                              disabled={!canIncreaseItem(item)}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                          <span data-branding-scope="cart/item-price" className="font-bold text-sm" style={{ color: accent }}>
                            {formatPrice(item.subtotal)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}

                  {bundleItems.filter(bi => Array.isArray(bi.slots)).map((bundleItem, index) => (
                    <div key={bundleItem.id} data-branding-scope="cart/item" className="group flex gap-3 rounded-xl p-4 shadow-sm border" style={{ backgroundColor: palette.card, borderColor: palette.border }}>
                      <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg" style={{ backgroundColor: palette.accentSoft }}>
                        {(bundleItem.bundleImageUrl || bundleItem.slots?.[0]?.menuItemImage) ? (
                          <OptimizedImage
                            src={bundleItem.bundleImageUrl || bundleItem.slots[0].menuItemImage!}
                            alt={bundleItem.bundleName}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform"
                            sizes="64px"
                            lazy={index > 1}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Package className="h-6 w-6" style={{ color: palette.muted }} />
                          </div>
                        )}
                      </div>

                      <div className="flex flex-1 flex-col min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-sm line-clamp-1" style={{ color: palette.text }}>
                              {bundleItem.bundleName}
                            </h4>
                            <Badge
                              variant="outline"
                              className="mt-1 text-xs"
                              style={badgeStyle}
                            >
                              {bundleItem.slots?.length ?? 0} items
                            </Badge>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove bundle ${bundleItem.bundleName}`}
                            className="h-8 w-8 hover:bg-[var(--cart-danger-soft)] touch-manipulation"
                            style={{ color: palette.danger }}
                            onClick={() => setBundleToRemove(bundleItem)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-9 w-9 rounded-full bg-transparent hover:bg-[var(--cart-soft)] hover:!border-[var(--cart-accent-border)] touch-manipulation"
                              style={outlineControl}
                              onClick={() => handleDecreaseBundleQuantity(bundleItem)}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-8 text-center text-sm font-bold" style={{ color: palette.text }}>
                              {bundleItem.quantity}
                            </span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-9 w-9 rounded-full bg-transparent hover:bg-[var(--cart-soft)] hover:!border-[var(--cart-accent-border)] touch-manipulation"
                              style={outlineControl}
                              onClick={() => updateBundleQuantity(bundleItem.id, bundleItem.quantity + 1)}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                          <span data-branding-scope="cart/item-price" className="font-bold text-sm" style={{ color: accent }}>
                            {formatPrice(bundleItem.subtotal)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {showCartOffers && (tenant?.id ?? tenantId) && (
                    <CartOffersSection
                      suggestions={cartOfferItems}
                      cartItemIds={items.map((line) => line.menu_item.id)}
                      maxItems={cartOfferMaxItems}
                      title={checkoutUpsellTitle}
                      subtitle={checkoutUpsellSubtitle || undefined}
                      theme={cartOfferThemeFromBranding(branding)}
                      tenantId={(tenant?.id ?? tenantId) as string}
                      tenantSlug={tenantSlug}
                      hideCurrencySymbol={tenant?.hide_currency_symbol}
                      onBeforeNavigate={onClose}
                    />
                  )}
                </div>
              </ScrollArea>

              <div data-branding-scope="cart/summary" className="flex-shrink-0 backdrop-blur-sm border-t px-4 py-4 space-y-3" style={{ borderColor: palette.border, backgroundColor: palette.summary }}>
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold" style={{ color: palette.text }}><StoreLabel name="cart.total" fallback="Total" /></span>
                  <span className="text-lg font-bold" style={{ color: accent }}>{formatPrice(total)}</span>
                </div>

                <div className="flex flex-col gap-3">
                  <Link href={`/${tenantSlug}/cart`} className="w-full hidden md:block" onClick={onClose}>
                    <Button
                      variant="outline"
                      className="w-full h-11 border-2 rounded-xl font-semibold transition-colors bg-transparent hover:bg-[var(--cart-soft)] hover:!border-[var(--cart-accent)]"
                      style={{ borderColor: palette.accentBorder, color: palette.text }}
                    >
                      Review Cart
                    </Button>
                  </Link>
                  <Button
                    data-branding-scope="cart/checkout-button"
                    className="w-full h-11 font-bold rounded-xl shadow-lg transition-opacity hover:opacity-90"
                    style={{ backgroundColor: palette.button, color: palette.buttonText }}
                    onClick={handleCheckoutClick}
                  >
                    <StoreLabel name="cart.checkout" fallback="Proceed to Checkout" />
                  </Button>
                </div>

                <p className="text-xs text-center pt-2 pb-10" style={{ color: palette.muted }}>
                  {items.length + bundleItems.length} item{items.length + bundleItems.length !== 1 ? 's' : ''} in cart
                </p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Edit Item Dialog — re-opens the line's configuration (flavor/variation,
          add-ons, quantity, note) so a wrong pick can be corrected in place
          instead of deleting the line and rebuilding it from the menu. */}
      {itemToEdit && (
        <ItemDetailModal
          item={itemToEdit.menu_item}
          editItem={itemToEdit}
          open={!!itemToEdit}
          onClose={() => setItemToEdit(null)}
          onAddToCart={(menuItem, variation, addons, quantity, specialInstructions) =>
            handleUpdateItem(itemToEdit.id, menuItem, variation, addons, quantity, specialInstructions)
          }
          branding={branding}
        />
      )}

      {/* Remove Item Confirmation Dialog */}
      <AlertDialog open={!!itemToRemove} onOpenChange={(open) => !open && handleCancelRemove()}>
        <AlertDialogContent className="max-w-sm rounded-2xl" style={dialogStyle}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center" style={{ color: palette.text }}>Remove Item?</AlertDialogTitle>
            <AlertDialogDescription className="text-center" style={{ color: palette.muted }}>
              Do you want to remove <span className="font-semibold" style={{ color: palette.text }}>{itemToRemove?.menu_item.name}</span> from your cart?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-3 sm:justify-center">
            <AlertDialogCancel className="flex-1 mt-0 rounded-xl bg-transparent hover:bg-[var(--cart-soft)]" style={outlineControl}>
              Keep Item
            </AlertDialogCancel>
            <AlertDialogAction
              className="flex-1 rounded-xl hover:opacity-90"
              style={dangerAction}
              onClick={handleConfirmRemove}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!bundleToRemove} onOpenChange={(open) => !open && setBundleToRemove(null)}>
        <AlertDialogContent className="max-w-sm rounded-2xl" style={dialogStyle}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center" style={{ color: palette.text }}>Remove Bundle?</AlertDialogTitle>
            <AlertDialogDescription className="text-center" style={{ color: palette.muted }}>
              Do you want to remove <span className="font-semibold" style={{ color: palette.text }}>{bundleToRemove?.bundleName}</span> from your cart?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-3 sm:justify-center">
            <AlertDialogCancel className="flex-1 mt-0 rounded-xl bg-transparent hover:bg-[var(--cart-soft)]" style={outlineControl}>
              Keep Bundle
            </AlertDialogCancel>
            <AlertDialogAction
              className="flex-1 rounded-xl hover:opacity-90"
              style={dangerAction}
              onClick={handleConfirmBundleRemove}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </>
  )
}
