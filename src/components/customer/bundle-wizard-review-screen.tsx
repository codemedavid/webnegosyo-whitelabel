'use client'

import { useCallback } from 'react'
import { ShoppingBag, Pencil } from 'lucide-react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import {
  formatPrice,
  calculateSlotBundleBasePrice,
  calculateSlotBundleExtras,
  calculateSlotBundleSavings,
} from '@/lib/cart-utils'
import type { BrandingColors } from '@/lib/branding-utils'
import type {
  BundleWithSlots,
  BundleSlot,
  CartBundleSlotSelection,
  CartBundleItem,
} from '@/types/database'

interface BundleWizardReviewScreenProps {
  bundle: BundleWithSlots
  slots: BundleSlot[]
  slotSelections: Map<string, CartBundleSlotSelection[]>
  branding: BrandingColors
  hideCurrencySymbol?: boolean
  runningTotal: number
  onEditSlot: (slotIndex: number) => void
  onAddToCart: () => void
}

function buildTempBundleItem(
  bundle: BundleWithSlots,
  slotSelections: Map<string, CartBundleSlotSelection[]>
): CartBundleItem {
  const allSlots = Array.from(slotSelections.values()).flat()
  return {
    id: '__review__',
    bundleId: bundle.id,
    bundleName: bundle.name,
    slots: allSlots,
    quantity: 1,
    pricingType: bundle.pricing_type,
    basePrice: bundle.pricing_type === 'fixed' ? (bundle.fixed_price ?? 0) : 0,
    discountPercent: bundle.discount_percent,
    subtotal: 0,
  }
}

function describeCustomizations(sel: CartBundleSlotSelection): string[] {
  const parts: string[] = []
  if (sel.selectedVariations) {
    Object.values(sel.selectedVariations).forEach((opt) => parts.push(opt.name))
  } else if (sel.selectedVariation) {
    parts.push(sel.selectedVariation.name)
  }
  sel.selectedAddons?.forEach((a) => parts.push(a.name))
  return parts
}

export function BundleWizardReviewScreen({
  bundle,
  slots,
  slotSelections,
  branding,
  hideCurrencySymbol,
  onEditSlot,
  onAddToCart,
}: BundleWizardReviewScreenProps) {
  const tempItem = buildTempBundleItem(bundle, slotSelections)
  const basePrice = calculateSlotBundleBasePrice(tempItem)
  const allSelections = Array.from(slotSelections.values()).flat()
  const extras = calculateSlotBundleExtras(allSelections)
  const savings = calculateSlotBundleSavings(tempItem)
  const grandTotal = basePrice + extras

  const handleEdit = useCallback(
    (slotIndex: number) => {
      onEditSlot(slotIndex)
    },
    [onEditSlot]
  )

  return (
    <div className="flex flex-col h-full">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {/* Bundle hero image */}
        {bundle.image_url && (
          <div className="relative w-full h-40 rounded-xl overflow-hidden mb-4">
            <OptimizedImage
              src={bundle.image_url}
              alt={bundle.name}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, 600px"
              loading="lazy"
            />
          </div>
        )}

        {/* Per-slot selection cards */}
        {slots.map((slot, slotIndex) => {
          const selections = slotSelections.get(slot.id) ?? []
          return (
            <div
              key={slot.id}
              className="rounded-xl border overflow-hidden"
              style={{ borderColor: branding.border, backgroundColor: branding.cards }}
            >
              {/* Slot header */}
              <div
                className="flex items-center justify-between px-3 py-2 border-b"
                style={{ borderColor: branding.border }}
              >
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: branding.textMuted }}>
                  {slot.name}
                </p>
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs font-medium"
                  style={{ color: branding.link }}
                  onClick={() => handleEdit(slotIndex)}
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
              </div>

              {/* Selection rows */}
              {selections.map((sel, idx) => {
                const customizations = describeCustomizations(sel)
                const extraCost =
                  sel.priceOverride +
                  (sel.selectedVariations
                    ? Object.values(sel.selectedVariations).reduce(
                        (sum, opt) => sum + (opt.price_modifier ?? 0),
                        0
                      )
                    : sel.selectedVariation?.price_modifier ?? 0) +
                  (sel.selectedAddons?.reduce((sum, a) => sum + a.price, 0) ?? 0)

                return (
                  <div
                    key={`${sel.menuItemId}-${idx}`}
                    className="flex items-center gap-3 px-3 py-2"
                  >
                    {sel.menuItemImage && (
                      <div className="relative h-12 w-12 rounded-lg overflow-hidden flex-shrink-0">
                        <OptimizedImage
                          src={sel.menuItemImage}
                          alt={sel.menuItemName}
                          fill
                          className="object-cover"
                          sizes="48px"
                          loading="lazy"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold line-clamp-1" style={{ color: branding.textPrimary }}>
                        {sel.menuItemName}
                      </p>
                      {customizations.length > 0 && (
                        <p className="text-xs mt-0.5 line-clamp-1" style={{ color: branding.textMuted }}>
                          {customizations.join(', ')}
                        </p>
                      )}
                    </div>
                    {extraCost > 0 && (
                      <p className="text-xs font-medium flex-shrink-0" style={{ color: branding.warning }}>
                        +{formatPrice(extraCost, { hideCurrencySymbol })}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}

        {/* Pricing breakdown */}
        <div
          className="rounded-xl border px-4 py-3 space-y-2 mt-2"
          style={{ borderColor: branding.border, backgroundColor: branding.cards }}
        >
          <p className="text-sm font-semibold mb-1" style={{ color: branding.textPrimary }}>
            Price breakdown
          </p>

          <div className="flex justify-between text-sm">
            <span style={{ color: branding.textSecondary }}>Bundle base</span>
            <span style={{ color: branding.textPrimary }}>{formatPrice(basePrice, { hideCurrencySymbol })}</span>
          </div>

          {extras > 0 && (
            <div className="flex justify-between text-sm">
              <span style={{ color: branding.textSecondary }}>Add-ons &amp; extras</span>
              <span style={{ color: branding.warning }}>+{formatPrice(extras, { hideCurrencySymbol })}</span>
            </div>
          )}

          {savings > 0 && (
            <div className="flex justify-between text-sm">
              <span style={{ color: branding.success }}>Bundle savings</span>
              <span style={{ color: branding.success }}>-{formatPrice(savings, { hideCurrencySymbol })}</span>
            </div>
          )}

          <div
            className="flex justify-between text-base font-bold border-t pt-2"
            style={{ borderColor: branding.border }}
          >
            <span style={{ color: branding.textPrimary }}>Total</span>
            <span style={{ color: branding.textPrimary }}>{formatPrice(grandTotal, { hideCurrencySymbol })}</span>
          </div>
        </div>
      </div>

      {/* Add to cart CTA */}
      <div
        className="shrink-0 px-4 pt-3 pb-5 border-t"
        style={{ borderColor: branding.border, backgroundColor: branding.cards }}
      >
        <button
          type="button"
          className="w-full rounded-xl text-base font-semibold flex items-center justify-center gap-2"
          style={{
            height: '52px',
            backgroundColor: branding.buttonPrimary,
            color: branding.buttonPrimaryText || '#fff',
            boxShadow: `0 6px 20px 0 color-mix(in srgb, ${branding.buttonPrimary} 38%, transparent)`,
          }}
          onClick={onAddToCart}
        >
          <ShoppingBag className="w-5 h-5" />
          Add Bundle to Cart
        </button>
      </div>
    </div>
  )
}
