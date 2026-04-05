'use client'

import { useState, useCallback, useMemo } from 'react'
import { Check } from 'lucide-react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { formatPrice } from '@/lib/cart-utils'
import type { BrandingColors } from '@/lib/branding-utils'
import type { BundleSlot, BundleSlotPriceOverride, CartBundleSlotSelection, MenuItem } from '@/types/database'

interface BundleWizardSlotScreenProps {
  slot: BundleSlot
  existingSelections: CartBundleSlotSelection[]
  getPriceOverride: (slotId: string, menuItemId: string) => BundleSlotPriceOverride | undefined
  branding: BrandingColors
  hideCurrencySymbol?: boolean
  onComplete: (selections: CartBundleSlotSelection[]) => void
}

export function BundleWizardSlotScreen({
  slot,
  existingSelections,
  getPriceOverride,
  branding,
  hideCurrencySymbol,
  onComplete,
}: BundleWizardSlotScreenProps) {
  const items: MenuItem[] = useMemo(() => slot.items ?? [], [slot.items])

  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    existingSelections.map((s) => s.menuItemId)
  )

  const toggleItem = useCallback(
    (item: MenuItem) => {
      setSelectedIds((prev) => {
        if (prev.includes(item.id)) {
          return prev.filter((id) => id !== item.id)
        }
        if (prev.length >= slot.pick_count) {
          // Replace the oldest selection
          return [...prev.slice(1), item.id]
        }
        return [...prev, item.id]
      })
    },
    [slot.pick_count]
  )

  const handleNext = useCallback(() => {
    const selections: CartBundleSlotSelection[] = selectedIds.map((itemId) => {
      const item = items.find((i) => i.id === itemId)!
      const override = getPriceOverride(slot.id, itemId)

      // Preserve existing customization if re-editing
      const existing = existingSelections.find((s) => s.menuItemId === itemId)

      return {
        slotId: slot.id,
        slotName: slot.name,
        menuItemId: itemId,
        menuItemName: item.name,
        menuItemImage: item.image_url ?? null,
        menuItemPrice: item.price,
        quantity: 1,
        selectedVariations: existing?.selectedVariations,
        selectedVariation: existing?.selectedVariation,
        selectedAddons: existing?.selectedAddons ?? [],
        priceOverride: override?.price_override ?? 0,
      }
    })

    onComplete(selections)
  }, [selectedIds, items, slot, existingSelections, getPriceOverride, onComplete])

  const isReady = selectedIds.length === slot.pick_count

  return (
    <div className="flex flex-col h-full">
      {/* Slot header */}
      <div className="px-4 py-3 shrink-0">
        <h2 className="text-lg font-bold" style={{ color: branding.textPrimary }}>
          {slot.name}
        </h2>
        <p className="text-sm mt-0.5" style={{ color: branding.textMuted }}>
          {slot.pick_count === 1
            ? 'Choose 1 item'
            : `Choose ${slot.pick_count} items (${selectedIds.length} of ${slot.pick_count} selected)`}
        </p>
      </div>

      {/* Item grid — scrollable */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="grid grid-cols-2 gap-3">
          {items.map((item, idx) => {
            const isSelected = selectedIds.includes(item.id)
            const selectionIndex = selectedIds.indexOf(item.id)
            const showNumber = slot.pick_count > 1 && isSelected
            const override = getPriceOverride(slot.id, item.id)
            const isIncluded = !override || override.price_override === 0
            const priceLabel = isIncluded
              ? 'Included'
              : `+${formatPrice(override!.price_override, { hideCurrencySymbol })}`

            return (
              <button
                key={`${item.id}-${idx}`}
                type="button"
                className="relative rounded-xl border-2 overflow-hidden text-left transition-all focus:outline-none"
                style={{
                  borderColor: isSelected ? branding.success : branding.border,
                  backgroundColor: branding.cards,
                }}
                onClick={() => toggleItem(item)}
              >
                {/* Item image */}
                <div className="relative w-full aspect-[4/3] bg-gray-100">
                  {item.image_url ? (
                    <OptimizedImage
                      src={item.image_url}
                      alt={item.name}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 45vw, 200px"
                      loading="lazy"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center"
                      style={{ backgroundColor: branding.border }}
                    >
                      <span className="text-2xl">🍽️</span>
                    </div>
                  )}

                  {/* Selection badge */}
                  {isSelected && (
                    <div
                      className="absolute top-2 right-2 rounded-full w-6 h-6 flex items-center justify-center"
                      style={{ backgroundColor: branding.success }}
                    >
                      {showNumber ? (
                        <span className="text-white text-xs font-bold">{selectionIndex + 1}</span>
                      ) : (
                        <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                      )}
                    </div>
                  )}

                  {/* Price label badge */}
                  <div
                    className="absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-xs font-semibold"
                    style={{
                      backgroundColor: isIncluded ? `${branding.success}22` : `${branding.warning}22`,
                      color: isIncluded ? branding.success : branding.warning,
                    }}
                  >
                    {priceLabel}
                  </div>
                </div>

                {/* Item name */}
                <div className="px-2 py-2">
                  <p
                    className="text-sm font-semibold line-clamp-2 leading-tight"
                    style={{ color: branding.cardTitle }}
                  >
                    {item.name}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: branding.textMuted }}>
                    {formatPrice(item.price, { hideCurrencySymbol })}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Bottom CTA */}
      <div
        className="shrink-0 px-4 pt-3 pb-5 border-t"
        style={{ borderColor: branding.border, backgroundColor: branding.cards }}
      >
        <button
          type="button"
          disabled={!isReady}
          className="w-full rounded-xl text-base font-semibold flex items-center justify-center transition-opacity"
          style={{
            height: '52px',
            backgroundColor: isReady ? branding.buttonPrimary : branding.border,
            color: isReady ? (branding.buttonPrimaryText || '#fff') : branding.textMuted,
            opacity: isReady ? 1 : 0.7,
          }}
          onClick={handleNext}
        >
          Next →
        </button>
      </div>
    </div>
  )
}
