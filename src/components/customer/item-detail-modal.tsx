'use client'

import { useState, useEffect, useMemo, type CSSProperties } from 'react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { Minus, Plus, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { MenuItem, Variation, Addon, VariationOption, CartItem } from '@/types/database'
import { formatPrice, calculateCartItemSubtotal } from '@/lib/cart-utils'
import { getContrastColor, setAlpha, type BrandingColors } from '@/lib/branding-utils'
import { AddonQuantityControl } from './addon-quantity-control'
import { ModifierGroupsSelector } from './modifier-groups-selector'
import { addonQuantity, setAddonQuantity } from '@/lib/addon-quantity'
import { normalizeModifierGroups } from '@/lib/modifier-groups'
import { getDefaultSelection, mapCartFormatToSelection, mapSelectionToCartFormat, restoreLinkedOptionSnapshots, setOptionQuantity, toggleOption, validateAllGroups, type ModifierSelection } from '@/lib/modifier-groups-cart'
import { toast } from 'sonner'

interface ItemDetailModalProps {
  item: MenuItem | null
  open: boolean
  onClose: () => void
  onAddToCart: (
    item: MenuItem,
    variationOrVariations: Variation | { [typeId: string]: VariationOption } | undefined,
    addons: Addon[],
    quantity: number,
    specialInstructions?: string
  ) => void
  branding: BrandingColors
  /**
   * When provided, the modal opens in "edit" mode: it seeds the current
   * selections from this cart line, the CTA reads "Update Cart", and submitting
   * calls `onAddToCart` with the edited configuration (the caller replaces the
   * existing line). Used to change a single item's flavor/variation from the cart.
   */
  editItem?: CartItem | null
}

const OPTION_FILL_ALPHA = 0.06
const OPTION_HOVER_ALPHA = 0.12
const SELECTED_RING_ALPHA = 0.2
const DANGER_SOFT_ALPHA = 0.1

/** Every colour the modal paints with, all from the store's modal branding. */
function getModalColors(branding: BrandingColors) {
  return {
    surface: branding.modalBackground,
    title: branding.modalTitle,
    muted: branding.modalDescription,
    price: branding.modalPrice,
    border: branding.border,
    primary: branding.primary,
    onPrimary: getContrastColor(branding.primary),
    optionFill: setAlpha(branding.primary, OPTION_FILL_ALPHA),
    optionHover: setAlpha(branding.primary, OPTION_HOVER_ALPHA),
    ring: setAlpha(branding.primary, SELECTED_RING_ALPHA),
    danger: branding.error,
    onDanger: getContrastColor(branding.error),
    dangerSoft: setAlpha(branding.error, DANGER_SOFT_ALPHA),
    button: branding.buttonPrimary,
    buttonText: branding.buttonPrimaryText,
  }
}

export function ItemDetailModal({
  item,
  open,
  onClose,
  onAddToCart,
  branding,
  editItem,
}: ItemDetailModalProps) {
  const isEditMode = !!editItem
  const groups = useMemo(() => {
    const normalized = item?.modifier_groups?.length ? normalizeModifierGroups(item) : []
    return editItem ? restoreLinkedOptionSnapshots(normalized, { selectedVariations: editItem.selected_variations ?? {}, selectedAddons: editItem.selected_addons }) : normalized
  }, [item, editItem])
  const useGroups = groups.length > 0
  const [selection, setSelection] = useState<ModifierSelection>({})
  // Legacy single variation
  const [selectedVariation, setSelectedVariation] = useState<Variation | undefined>()
  // New grouped variations: map of type ID -> selected option
  const [selectedVariations, setSelectedVariations] = useState<{ [typeId: string]: VariationOption }>({})
  const [selectedAddons, setSelectedAddons] = useState<Addon[]>([])
  const [quantity, setQuantity] = useState(1)
  const [specialInstructions, setSpecialInstructions] = useState('')

  // Determine if using new or legacy variation system
  const useNewVariations = item?.variation_types && item.variation_types.length > 0

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedVariation(item?.variations.find((v) => v.is_default))
      setSelectedVariations({})
      setSelectedAddons([])
      setQuantity(1)
      setSpecialInstructions('')
      onClose()
    }
  }

  // Seed selections whenever the modal opens. In edit mode, seed from the cart
  // line being edited; otherwise seed the item's default selections.
  useEffect(() => {
    if (!open || !item) return

    setSelection(editItem ? mapCartFormatToSelection(groups, {
      selectedVariations: editItem.selected_variations ?? (editItem.selected_variation ? { 'legacy-variations': { ...editItem.selected_variation, display_order: 0 } } : {}),
      selectedAddons: editItem.selected_addons,
    }) : getDefaultSelection(groups))
    if (editItem) {
      setSelectedVariation(editItem.selected_variation)
      setSelectedVariations(editItem.selected_variations ?? {})
      setSelectedAddons(editItem.selected_addons ?? [])
      setQuantity(editItem.quantity)
      setSpecialInstructions(editItem.special_instructions ?? '')
      return
    }

    // Add mode: legacy variations
    if (item.variations.length > 0) {
      const defaultVar = item.variations.find((v) => v.is_default) || item.variations[0]
      setSelectedVariation(defaultVar)
    }

    // Add mode: new variation types
    if (item.variation_types && item.variation_types.length > 0) {
      const defaults: { [typeId: string]: VariationOption } = {}
      item.variation_types.forEach(type => {
        if (type.options.length > 0) {
          const defaultOption = type.options.find(opt => opt.is_default) || type.options[0]
          defaults[type.id] = defaultOption
        }
      })
      setSelectedVariations(defaults)
    }
    setSelectedAddons([])
    setQuantity(1)
    setSpecialInstructions('')
  }, [open, item, editItem, groups])

  if (!item) return null

  const c = getModalColors(branding)
  // Hover tints can't be inline styles; expose them as variables for classes.
  const modalVars = {
    '--idm-hover': c.optionHover,
    '--idm-border-hover': c.primary,
    '--tw-ring-offset-color': c.surface,
  } as CSSProperties
  const unselectedOptionStyle = { backgroundColor: c.optionFill, color: c.title, borderColor: c.border }
  const selectedOptionStyle = { backgroundColor: c.primary, color: c.onPrimary }

  const hasDiscount = item.discounted_price && item.discounted_price < item.price
  const basePrice = hasDiscount ? item.discounted_price! : item.price
  const hasVariations = item.variations.length > 0
  const hasVariationTypes = item.variation_types && item.variation_types.length > 0
  const hasAddons = item.addons.length > 0
  const hasCustomizations = useGroups || hasVariations || hasVariationTypes || hasAddons

  // Calculate total price based on which variation system is used
  const cartFormat = mapSelectionToCartFormat(groups, selection)
  const totalPrice = useGroups
    ? calculateCartItemSubtotal(basePrice, cartFormat.selectedVariations, cartFormat.selectedAddons, quantity)
    : useNewVariations
    ? calculateCartItemSubtotal(basePrice, selectedVariations, selectedAddons, quantity)
    : calculateCartItemSubtotal(basePrice, selectedVariation, selectedAddons, quantity)

  const handleAddToCart = () => {
    if (useGroups) {
      const result = validateAllGroups(groups, selection, quantity)
      if (!result.valid) { toast.error(result.error); return }
    }
    // Check if required variation types have selections
    if (!useGroups && useNewVariations && item.variation_types) {
      const missingRequired = item.variation_types.find(
        type => type.is_required && !selectedVariations[type.id]
      )
      if (missingRequired) {
        toast.error(`Please select ${missingRequired.name}`)
        return
      }
    }

    // Pass the appropriate variation format
    const variationData = useGroups ? cartFormat.selectedVariations : useNewVariations ? selectedVariations : selectedVariation
    onAddToCart(item, variationData, useGroups ? cartFormat.selectedAddons : selectedAddons, quantity, specialInstructions)
    toast.success(isEditMode ? `Updated ${item.name}` : `Added ${item.name} to cart`)
    handleOpenChange(false)
  }

  // Compact, minimal modal design - only show what's needed
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        data-branding-scope="storefront/quickview"
        className="!fixed w-[calc(100%-2rem)] max-w-md sm:max-w-lg flex flex-col p-0 gap-0 overflow-hidden rounded-2xl sm:rounded-3xl !left-1/2 !-translate-x-1/2 !m-0 border shadow-2xl !bottom-4 sm:!top-1/2 sm:!bottom-auto sm:!-translate-y-1/2 h-[72vh] sm:h-auto sm:max-h-[68vh]"
        showCloseButton={false}
        style={{ ...modalVars, backgroundColor: c.surface, borderColor: c.border, color: c.title }}
      >
        <DialogTitle className="sr-only">{item.name}</DialogTitle>

        {/* Scrollable Container - Includes everything except footer */}
        <div className="flex-1 overflow-y-auto overscroll-contain" style={{ minHeight: 0 }}>
          {/* Compact Header - Image Left, Info Right */}
          <div className="sticky top-0 z-10" style={{ backgroundColor: c.surface }}>
            <div className="relative">
              <button
                onClick={() => handleOpenChange(false)}
                className="absolute top-3 right-3 backdrop-blur-sm rounded-full p-2 hover:opacity-90 transition-opacity shadow-md z-20"
                style={{ backgroundColor: c.surface, color: c.title }}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="flex gap-4 p-4 sm:p-6 border-b" style={{ borderColor: c.border }}>
                {/* Image - Left Side */}
                <div className="relative w-28 h-28 sm:w-32 sm:h-32 flex-shrink-0 rounded-xl overflow-hidden" style={{ backgroundColor: c.optionFill }}>
                  <OptimizedImage
                    src={item.image_url}
                    alt={item.name}
                    fill
                    className="object-cover"
                    sizes="128px"
                    priority
                  />
                  {hasDiscount && (
                    <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-semibold shadow-lg" style={{ backgroundColor: c.danger, color: c.onDanger }}>
                      Sale
                    </div>
                  )}
                </div>

                {/* Info - Right Side */}
                <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
                  {/* Top: Title */}
                  <div>
                    <h1
                      data-branding-scope="storefront/quickview-title"
                      className="text-lg sm:text-xl font-bold line-clamp-2 mb-1.5"
                      style={{ color: c.title }}
                    >
                      {item.name}
                    </h1>
                    {item.description && (
                      <p
                        data-branding-scope="storefront/quickview-description"
                        className="text-xs sm:text-sm line-clamp-2 leading-relaxed"
                        style={{ color: c.muted }}
                      >
                        {item.description}
                      </p>
                    )}
                  </div>

                  {/* Bottom: Price */}
                  <div className="mt-2">
                    {hasDiscount && (
                      <div className="text-xs line-through mb-0.5" style={{ color: c.muted }}>
                        {formatPrice(item.price)}
                      </div>
                    )}
                    <div
                      data-branding-scope="storefront/quickview-price"
                      className="text-xl sm:text-2xl font-bold"
                      style={{ color: c.price }}
                    >
                      {formatPrice(basePrice)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Options Content */}
          {hasCustomizations && (
            <div style={{ backgroundColor: c.surface }}>
              <div className="p-4 sm:p-6 space-y-5 pb-6">
                {/* New Grouped Variation Types */}
                {!useGroups && hasVariationTypes && item.variation_types && item.variation_types.map((variationType) => {
                  const selectedOption = selectedVariations[variationType.id]

                  return (
                    <div key={variationType.id} className="scroll-mt-4">
                      <div className="flex items-center gap-2 mb-3">
                        <h3 className="text-sm sm:text-base font-semibold" style={{ color: c.title }}>
                          {variationType.name}
                        </h3>
                        {variationType.is_required && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ color: c.danger, backgroundColor: c.dangerSoft }}>
                            Required
                          </span>
                        )}
                      </div>

                      {/* Show as image grid if any option has an image */}
                      {variationType.options.some(opt => opt.image_url) ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
                          {variationType.options.map((option) => {
                            const isSelected = selectedOption?.id === option.id

                            return (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => setSelectedVariations(prev => ({ ...prev, [variationType.id]: option }))}
                                className={`
                                relative rounded-xl overflow-hidden transition-all border-2 active:scale-95
                                ${isSelected
                                    ? 'shadow-md ring-2 ring-offset-2'
                                    : 'hover:!border-[var(--idm-border-hover)] hover:shadow-sm'
                                  }
                              `}
                                style={isSelected ? {
                                  borderColor: c.primary,
                                  ['--tw-ring-color' as string]: c.ring
                                } : { borderColor: c.border }}
                              >
                                {/* Option Image */}
                                {option.image_url && (
                                  <div className="relative w-full aspect-square" style={{ backgroundColor: c.optionFill }}>
                                    <OptimizedImage
                                      src={option.image_url}
                                      alt={option.name}
                                      fill
                                      className="object-cover"
                                      sizes="(max-width: 640px) 50vw, 33vw"
                                    />
                                    {isSelected && (
                                      <div
                                        className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center shadow-lg"
                                        style={selectedOptionStyle}
                                      >
                                        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                      </div>
                                    )}
                                  </div>
                                )}
                                {/* Option Details */}
                                <div className="p-2.5 text-center"
                                  style={isSelected ? selectedOptionStyle : { backgroundColor: c.surface, color: c.title }}>
                                  <div className="font-semibold text-xs sm:text-sm line-clamp-1">{option.name}</div>
                                  {option.price_modifier !== 0 && (
                                    <div className="text-xs opacity-90 mt-0.5">
                                      +{formatPrice(option.price_modifier)}
                                    </div>
                                  )}
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      ) : (
                        /* Text-only buttons for options without images */
                        <div className="flex flex-wrap gap-2">
                          {variationType.options.map((option) => {
                            const isSelected = selectedOption?.id === option.id

                            return (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => setSelectedVariations(prev => ({ ...prev, [variationType.id]: option }))}
                                className={`
                                px-4 py-2.5 rounded-lg text-sm font-medium transition-all min-w-[90px] active:scale-95
                                ${isSelected
                                    ? 'shadow-md'
                                    : 'hover:!bg-[var(--idm-hover)] border'
                                  }
                              `}
                                style={isSelected ? selectedOptionStyle : unselectedOptionStyle}
                              >
                                <div className="text-center">
                                  <div className="font-semibold">{option.name}</div>
                                  {option.price_modifier !== 0 && (
                                    <div className="text-xs opacity-90 mt-0.5">
                                      +{formatPrice(option.price_modifier)}
                                    </div>
                                  )}
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Legacy Variations (fallback for old items) */}
                {!useGroups && !useNewVariations && hasVariations && (
                  <div className="scroll-mt-4">
                    <h3 className="text-sm sm:text-base font-semibold mb-3" style={{ color: c.title }}>
                      Choose Size
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {item.variations.map((variation) => {
                        const isSelected = selectedVariation?.id === variation.id

                        return (
                          <button
                            key={variation.id}
                            type="button"
                            onClick={() => setSelectedVariation(variation)}
                            className={`
                            px-4 py-2.5 rounded-lg text-sm font-medium transition-all min-w-[90px] active:scale-95
                            ${isSelected
                                ? 'shadow-md'
                                : 'hover:!bg-[var(--idm-hover)] border'
                              }
                          `}
                            style={isSelected ? selectedOptionStyle : unselectedOptionStyle}
                          >
                            <div className="text-center">
                              <div className="font-semibold">{variation.name}</div>
                              {variation.price_modifier !== 0 && (
                                <div className="text-xs opacity-90 mt-0.5">
                                  +{formatPrice(variation.price_modifier)}
                                </div>
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {useGroups && <ModifierGroupsSelector groups={groups} selection={selection} parentQuantity={quantity}
                  onToggle={(group, id) => setSelection(prev => toggleOption(prev, group, id))}
                  onQuantityChange={(group, id, value) => setSelection(prev => setOptionQuantity(prev, group, id, value))} />}

                {/* Add-ons */}
                {!useGroups && hasAddons && (
                  <div className="scroll-mt-4">
                    <h3 className="text-sm sm:text-base font-semibold mb-3" style={{ color: c.title }}>
                      Add-ons <span className="text-xs font-normal" style={{ color: c.muted }}>(Optional)</span>
                    </h3>
                    <div className="space-y-2">
                      <p className="text-xs" style={{ color: c.muted }}>Quantities are per item.</p>
                      {item.addons.map(addon => (
                        <AddonQuantityControl key={addon.id} name={addon.name} price={addon.price}
                          quantity={selectedAddons.some(a => a.id === addon.id) ? addonQuantity(selectedAddons.find(a => a.id === addon.id)!) : 0}
                          onChange={value => setSelectedAddons(prev => setAddonQuantity(prev, addon, value))} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer - Always visible, sticky */}
        <div className="flex-shrink-0 border-t px-4 sm:px-6 py-3 sm:py-4 shadow-[0_-4px_12px_-2px_rgba(0,0,0,0.1)]" style={{ backgroundColor: c.surface, borderColor: c.border }}>
          <div className="flex items-center gap-3">
            {/* Quantity - Compact */}
            <div className="flex items-center gap-1.5 rounded-xl px-1.5 flex-shrink-0" style={{ backgroundColor: c.optionFill, color: c.title }}>
              <button
                type="button"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
                className="h-10 w-10 rounded-lg flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--idm-hover)] active:scale-95 transition-all touch-manipulation"
                aria-label="Decrease quantity"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-8 text-center text-base font-semibold select-none">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity(quantity + 1)}
                className="h-10 w-10 rounded-lg flex items-center justify-center hover:bg-[var(--idm-hover)] active:scale-95 transition-all touch-manipulation"
                aria-label="Increase quantity"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {/* Add to Cart - Primary button */}
            <Button
              type="button"
              onClick={handleAddToCart}
              className="flex-1 h-12 rounded-xl font-semibold text-sm sm:text-base shadow-md hover:shadow-lg active:scale-[0.98] transition-all touch-manipulation"
              style={{
                backgroundColor: c.button,
                color: c.buttonText
              }}
            >
              <span className="flex items-center justify-center gap-2">
                <span>{isEditMode ? 'Update Cart' : 'Add to Cart'}</span>
                <span className="font-bold">•</span>
                <span>{formatPrice(totalPrice)}</span>
              </span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
