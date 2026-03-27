'use client'

import { useState, useCallback, useMemo } from 'react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { formatPrice } from '@/lib/cart-utils'
import type { BrandingColors } from '@/lib/branding-utils'
import type { BundleSlot, CartBundleSlotSelection, VariationOption, Variation, Addon } from '@/types/database'

interface BundleWizardCustomizeScreenProps {
  slot: BundleSlot
  selections: CartBundleSlotSelection[]
  branding: BrandingColors
  hideCurrencySymbol?: boolean
  onComplete: (updatedSelections: CartBundleSlotSelection[]) => void
}

/** Indices into `selections` that have variations or addons and need customization */
function getCustomizableIndices(
  selections: CartBundleSlotSelection[],
  slot: BundleSlot
): number[] {
  return selections.reduce<number[]>((acc, sel, idx) => {
    const item = slot.items?.find((i) => i.id === sel.menuItemId)
    if (!item) return acc
    const hasVariationTypes = (item.variation_types?.length ?? 0) > 0
    const hasLegacyVariations = !hasVariationTypes && (item.variations?.length ?? 0) > 0
    const hasAddons = (item.addons?.length ?? 0) > 0
    if (hasVariationTypes || hasLegacyVariations || hasAddons) {
      acc.push(idx)
    }
    return acc
  }, [])
}

export function BundleWizardCustomizeScreen({
  slot,
  selections,
  branding,
  hideCurrencySymbol,
  onComplete,
}: BundleWizardCustomizeScreenProps) {
  const customizableIndices = useMemo(
    () => getCustomizableIndices(selections, slot),
    [selections, slot]
  )

  const [currentStep, setCurrentStep] = useState(0)
  // Local copy of selections we mutate as the user customizes
  const [localSelections, setLocalSelections] = useState<CartBundleSlotSelection[]>(() =>
    selections.map((s) => ({ ...s }))
  )

  const currentSelectionIndex = customizableIndices[currentStep]
  const currentSelection = localSelections[currentSelectionIndex]
  const currentItem = slot.items?.find((i) => i.id === currentSelection?.menuItemId)

  const isLast = currentStep === customizableIndices.length - 1

  const handleVariationSelect = useCallback(
    (typeId: string, option: VariationOption) => {
      setLocalSelections((prev) => {
        const next = [...prev]
        const sel = { ...next[currentSelectionIndex] }
        sel.selectedVariations = {
          ...(sel.selectedVariations ?? {}),
          [typeId]: option,
        }
        // When using new grouped variations, clear legacy variation
        sel.selectedVariation = undefined
        next[currentSelectionIndex] = sel
        return next
      })
    },
    [currentSelectionIndex]
  )

  const handleLegacyVariationSelect = useCallback(
    (variation: Variation) => {
      setLocalSelections((prev) => {
        const next = [...prev]
        const sel = { ...next[currentSelectionIndex] }
        sel.selectedVariation = variation
        sel.selectedVariations = undefined
        next[currentSelectionIndex] = sel
        return next
      })
    },
    [currentSelectionIndex]
  )

  const handleAddonToggle = useCallback(
    (addon: Addon) => {
      setLocalSelections((prev) => {
        const next = [...prev]
        const sel = { ...next[currentSelectionIndex] }
        const currentAddons = sel.selectedAddons ?? []
        const exists = currentAddons.some((a) => a.id === addon.id)
        sel.selectedAddons = exists
          ? currentAddons.filter((a) => a.id !== addon.id)
          : [...currentAddons, addon]
        next[currentSelectionIndex] = sel
        return next
      })
    },
    [currentSelectionIndex]
  )

  const handleContinue = useCallback(() => {
    if (isLast) {
      onComplete(localSelections)
    } else {
      setCurrentStep((s) => s + 1)
    }
  }, [isLast, onComplete, localSelections])

  if (!currentItem || !currentSelection) return null

  const hasVariationTypes = (currentItem.variation_types?.length ?? 0) > 0
  const hasLegacyVariations = !hasVariationTypes && (currentItem.variations?.length ?? 0) > 0
  const hasAddons = (currentItem.addons?.length ?? 0) > 0

  const stepLabel =
    customizableIndices.length > 1
      ? `Item ${currentStep + 1} of ${customizableIndices.length}`
      : ''

  return (
    <div className="flex flex-col h-full">
      {/* Item header */}
      <div
        className="shrink-0 flex items-center gap-3 px-4 py-3 border-b"
        style={{ borderColor: branding.border }}
      >
        {currentItem.image_url && (
          <div className="relative h-16 w-16 rounded-lg overflow-hidden flex-shrink-0">
            <OptimizedImage
              src={currentItem.image_url}
              alt={currentItem.name}
              fill
              className="object-cover"
              sizes="64px"
              loading="lazy"
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide mb-0.5" style={{ color: branding.textMuted }}>
            {slot.name}{stepLabel ? ` · ${stepLabel}` : ''}
          </p>
          <h2 className="text-base font-bold leading-tight" style={{ color: branding.textPrimary }}>
            {currentItem.name}
          </h2>
          <p className="text-sm mt-0.5" style={{ color: branding.textSecondary }}>
            {formatPrice(currentItem.price, { hideCurrencySymbol })}
          </p>
        </div>
      </div>

      {/* Customization options — scrollable */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* New grouped variation types */}
        {hasVariationTypes &&
          currentItem.variation_types!.map((vt) => (
            <div key={vt.id}>
              <p className="text-sm font-semibold mb-2" style={{ color: branding.textPrimary }}>
                {vt.name}
                {vt.is_required && <span className="text-red-500 ml-1">*</span>}
              </p>
              <div className="flex flex-wrap gap-2">
                {vt.options.map((opt) => {
                  const isSelected =
                    currentSelection.selectedVariations?.[vt.id]?.id === opt.id
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className="rounded-full px-3 py-1.5 text-sm font-medium border-2 transition-all"
                      style={{
                        backgroundColor: isSelected ? branding.primary : 'transparent',
                        color: isSelected
                          ? branding.buttonPrimaryText || '#fff'
                          : branding.textSecondary,
                        borderColor: isSelected ? branding.primary : branding.border,
                      }}
                      onClick={() => handleVariationSelect(vt.id, opt)}
                    >
                      {opt.name}
                      {(opt.price_modifier ?? 0) > 0 &&
                        ` (+${formatPrice(opt.price_modifier, { hideCurrencySymbol })})`}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

        {/* Legacy flat variations */}
        {hasLegacyVariations && (
          <div>
            <p className="text-sm font-semibold mb-2" style={{ color: branding.textPrimary }}>
              Size
            </p>
            <div className="flex flex-wrap gap-2">
              {currentItem.variations.map((v) => {
                const isSelected = currentSelection.selectedVariation?.id === v.id
                return (
                  <button
                    key={v.id}
                    type="button"
                    className="rounded-full px-3 py-1.5 text-sm font-medium border-2 transition-all"
                    style={{
                      backgroundColor: isSelected ? branding.primary : 'transparent',
                      color: isSelected
                        ? branding.buttonPrimaryText || '#fff'
                        : branding.textSecondary,
                      borderColor: isSelected ? branding.primary : branding.border,
                    }}
                    onClick={() => handleLegacyVariationSelect(v)}
                  >
                    {v.name}
                    {(v.price_modifier ?? 0) > 0 &&
                      ` (+${formatPrice(v.price_modifier, { hideCurrencySymbol })})`}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Add-ons */}
        {hasAddons && (
          <div>
            <p className="text-sm font-semibold mb-2" style={{ color: branding.textPrimary }}>
              Add-ons
            </p>
            <div className="space-y-2">
              {currentItem.addons.map((addon) => {
                const isSelected = currentSelection.selectedAddons?.some((a) => a.id === addon.id) ?? false
                return (
                  <button
                    key={addon.id}
                    type="button"
                    className="flex w-full items-center justify-between rounded-xl px-4 py-3 border-2 text-sm transition-all"
                    style={{
                      backgroundColor: isSelected ? `${branding.primary}12` : 'transparent',
                      borderColor: isSelected ? branding.primary : branding.border,
                      color: branding.textPrimary,
                    }}
                    onClick={() => handleAddonToggle(addon)}
                  >
                    <span className="font-medium">{addon.name}</span>
                    <span style={{ color: branding.textMuted }}>
                      +{formatPrice(addon.price, { hideCurrencySymbol })}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bottom CTA */}
      <div
        className="shrink-0 px-4 pt-3 pb-5 border-t"
        style={{ borderColor: branding.border, backgroundColor: branding.cards }}
      >
        <button
          type="button"
          className="w-full rounded-xl text-base font-semibold flex items-center justify-center"
          style={{
            height: '52px',
            backgroundColor: branding.buttonPrimary,
            color: branding.buttonPrimaryText || '#fff',
          }}
          onClick={handleContinue}
        >
          {isLast ? 'Continue →' : 'Next item →'}
        </button>
      </div>
    </div>
  )
}
