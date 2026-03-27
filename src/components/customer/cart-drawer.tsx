'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ShoppingCart, Minus, Plus, Trash2, Package } from 'lucide-react'
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
import { EmptyState } from '@/components/shared/empty-state'
import { useCart } from '@/hooks/useCart'
import { formatPrice } from '@/lib/cart-utils'
import { CheckoutUpsellModal } from '@/components/customer/checkout-upsell-modal'
import type { BrandingColors } from '@/lib/branding-utils'
import type { CartItem, CartBundleItem } from '@/types/database'
import Link from 'next/link'

interface CartDrawerProps {
  open: boolean
  onClose: () => void
  tenantSlug: string
  branding: BrandingColors
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
  tenantId,
  menuEngineeringEnabled,
  checkoutUpsellEnabled,
  checkoutUpsellTitle = 'Before you go...',
  checkoutUpsellSubtitle = 'You might also enjoy these items',
  checkoutUpsellMaxItems = 4,
}: CartDrawerProps) {
  const router = useRouter()
  const { items, total, updateQuantity, removeItem, bundleItems, updateBundleQuantity, removeBundleFromCart } = useCart()
  const [itemToRemove, setItemToRemove] = useState<CartItem | null>(null)
  const [bundleToRemove, setBundleToRemove] = useState<CartBundleItem | null>(null)
  const [showUpsellModal, setShowUpsellModal] = useState(false)

  const showInterstitial = menuEngineeringEnabled && checkoutUpsellEnabled && !!tenantId

  const handleCheckoutClick = useCallback(() => {
    if (showInterstitial) {
      onClose()
      setShowUpsellModal(true)
    } else {
      onClose()
      router.push(`/${tenantSlug}/checkout`)
    }
  }, [showInterstitial, onClose, router, tenantSlug])

  const handleUpsellContinue = useCallback(() => {
    setShowUpsellModal(false)
    onClose()
    router.push(`/${tenantSlug}/checkout`)
  }, [onClose, router, tenantSlug])

  const handleDecreaseQuantity = (item: CartItem) => {
    if (item.quantity <= 1) {
      // Show confirmation dialog when trying to decrease below 1
      setItemToRemove(item)
    } else {
      updateQuantity(item.id, item.quantity - 1)
    }
  }

  const handleConfirmRemove = () => {
    if (itemToRemove) {
      removeItem(itemToRemove.id)
      setItemToRemove(null)
    }
  }

  const handleCancelRemove = () => {
    setItemToRemove(null)
  }

  const handleDecreaseBundleQuantity = (bundle: CartBundleItem) => {
    if (bundle.quantity <= 1) {
      setBundleToRemove(bundle)
    } else {
      updateBundleQuantity(bundle.id, bundle.quantity - 1)
    }
  }

  const handleConfirmBundleRemove = () => {
    if (bundleToRemove) {
      removeBundleFromCart(bundleToRemove.id)
      setBundleToRemove(null)
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent className="flex w-full flex-col sm:max-w-lg bg-gradient-to-b from-gray-50 to-gray-100 p-0 h-full">
          <SheetHeader className="flex-shrink-0 bg-white/95 backdrop-blur-sm border-b px-4 py-2" style={{ borderColor: `${branding.primary}20` }}>
            <SheetTitle className="flex items-center gap-2 text-base">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0"
                style={{ backgroundColor: branding.primary }}
              >
                <ShoppingCart className="h-4 w-4 text-white" />
              </div>
              <div>
                <span className="text-gray-900">Your Cart</span>
                <p className="text-[11px] font-normal text-gray-500 leading-tight">({items.length + bundleItems.length} items)</p>
              </div>
            </SheetTitle>
          </SheetHeader>

          {items.length === 0 && bundleItems.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                icon={ShoppingCart}
                title="Your cart is empty"
                description="Add some delicious items to get started"
              />
            </div>
          ) : (
            <>
              <ScrollArea className="flex-1 overflow-y-auto px-4">
                <div className="space-y-3 pt-3 pb-4">
                  {items.map((item, index) => (
                    <div key={item.id} className="group flex gap-3 rounded-xl bg-white p-4 shadow-sm border border-gray-100">
                      <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
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
                            <h4 className="font-semibold text-sm line-clamp-1 text-gray-900">
                              {item.menu_item.name}
                            </h4>

                            {/* Legacy single variation */}
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

                            {/* New grouped variations */}
                            {item.selected_variations && Object.keys(item.selected_variations).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {Object.values(item.selected_variations).map((option, idx) => (
                                  <Badge
                                    key={idx}
                                    variant="outline"
                                    className="text-xs"
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
                            className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 touch-manipulation"
                            onClick={() => setItemToRemove(item)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        {(item.selected_addons.length > 0 || item.special_instructions) && (
                          <div className="text-xs text-gray-500 mb-2 space-y-0.5">
                            {item.selected_addons.length > 0 && (
                              <p className="line-clamp-2">
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

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-9 w-9 rounded-full hover:bg-orange-50 border-gray-200 touch-manipulation"
                              onClick={() => handleDecreaseQuantity(item)}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-8 text-center text-sm font-bold text-gray-900">
                              {item.quantity}
                            </span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-9 w-9 rounded-full hover:bg-orange-50 border-gray-200 touch-manipulation"
                              onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                          <span className="font-bold text-sm" style={{ color: branding.primary }}>
                            {formatPrice(item.subtotal)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}

                  {bundleItems.map((bundleItem, index) => (
                    <div key={bundleItem.id} className="group flex gap-3 rounded-xl bg-white p-4 shadow-sm border border-gray-100">
                      <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                        {bundleItem.slots[0]?.menuItemImage ? (
                          <OptimizedImage
                            src={bundleItem.slots[0].menuItemImage}
                            alt={bundleItem.bundleName}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform"
                            sizes="64px"
                            lazy={index > 1}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Package className="h-6 w-6 text-gray-400" />
                          </div>
                        )}
                      </div>

                      <div className="flex flex-1 flex-col min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-sm line-clamp-1 text-gray-900">
                              {bundleItem.bundleName}
                            </h4>
                            <Badge
                              variant="outline"
                              className="mt-1 text-xs"
                              style={{
                                borderColor: `${branding.primary}40`,
                                color: branding.primary,
                                backgroundColor: `${branding.primary}10`
                              }}
                            >
                              {bundleItem.slots.length} items
                            </Badge>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 touch-manipulation"
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
                              className="h-9 w-9 rounded-full hover:bg-orange-50 border-gray-200 touch-manipulation"
                              onClick={() => handleDecreaseBundleQuantity(bundleItem)}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-8 text-center text-sm font-bold text-gray-900">
                              {bundleItem.quantity}
                            </span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-9 w-9 rounded-full hover:bg-orange-50 border-gray-200 touch-manipulation"
                              onClick={() => updateBundleQuantity(bundleItem.id, bundleItem.quantity + 1)}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                          <span className="font-bold text-sm" style={{ color: branding.primary }}>
                            {formatPrice(bundleItem.subtotal)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="flex-shrink-0 bg-white/95 backdrop-blur-sm border-t px-4 py-4 space-y-3" style={{ borderColor: `${branding.primary}20` }}>
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-gray-900">Total</span>
                  <span className="text-lg font-bold" style={{ color: branding.primary }}>{formatPrice(total)}</span>
                </div>

                <div className="flex flex-col gap-3">
                  <Link href={`/${tenantSlug}/cart`} className="w-full hidden md:block" onClick={onClose}>
                    <Button
                      variant="outline"
                      className="w-full h-11 border-2 border-gray-200 rounded-xl font-semibold transition-colors"
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
                  <Button
                    className="w-full h-11 text-white font-bold rounded-xl shadow-lg transition-opacity hover:opacity-90"
                    style={{ backgroundColor: branding.primary }}
                    onClick={handleCheckoutClick}
                  >
                    Proceed to Checkout
                  </Button>
                </div>

                <p className="text-xs text-center text-gray-500 pt-2 pb-10">
                  {items.length + bundleItems.length} item{items.length + bundleItems.length !== 1 ? 's' : ''} in cart
                </p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Remove Item Confirmation Dialog */}
      <AlertDialog open={!!itemToRemove} onOpenChange={(open) => !open && handleCancelRemove()}>
        <AlertDialogContent className="max-w-sm rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center">Remove Item?</AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              Do you want to remove <span className="font-semibold text-gray-900">{itemToRemove?.menu_item.name}</span> from your cart?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-3 sm:justify-center">
            <AlertDialogCancel className="flex-1 mt-0 rounded-xl">
              Keep Item
            </AlertDialogCancel>
            <AlertDialogAction
              className="flex-1 bg-red-500 hover:bg-red-600 rounded-xl"
              onClick={handleConfirmRemove}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!bundleToRemove} onOpenChange={(open) => !open && setBundleToRemove(null)}>
        <AlertDialogContent className="max-w-sm rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center">Remove Bundle?</AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              Do you want to remove <span className="font-semibold text-gray-900">{bundleToRemove?.bundleName}</span> from your cart?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-3 sm:justify-center">
            <AlertDialogCancel className="flex-1 mt-0 rounded-xl">
              Keep Bundle
            </AlertDialogCancel>
            <AlertDialogAction
              className="flex-1 bg-red-500 hover:bg-red-600 rounded-xl"
              onClick={handleConfirmBundleRemove}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Checkout Upsell Interstitial */}
      {showInterstitial && (
        <CheckoutUpsellModal
          open={showUpsellModal}
          onContinue={handleUpsellContinue}
          tenantId={tenantId}
          branding={branding}
          title={checkoutUpsellTitle}
          subtitle={checkoutUpsellSubtitle}
          maxItems={checkoutUpsellMaxItems}
        />
      )}
    </>
  )
}
