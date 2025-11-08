'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Minus, Plus, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { MenuItem, Variation, Addon, VariationOption } from '@/types/database'
import { formatPrice, calculateCartItemSubtotal } from '@/lib/cart-utils'
import type { BrandingColors } from '@/lib/branding-utils'
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
}

export function ItemDetailModal({
  item,
  open,
  onClose,
  onAddToCart,
  branding,
}: ItemDetailModalProps) {
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

  // Initialize default selections
  useEffect(() => {
    if (!item) return

    // Legacy variations
    if (item.variations.length > 0 && !selectedVariation) {
      const defaultVar = item.variations.find((v) => v.is_default) || item.variations[0]
      setSelectedVariation(defaultVar)
    }

    // New variation types
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
  }, [item, selectedVariation])

  if (!item) return null

  const hasDiscount = item.discounted_price && item.discounted_price < item.price
  const basePrice = hasDiscount ? item.discounted_price! : item.price
  const hasVariations = item.variations.length > 0
  const hasVariationTypes = item.variation_types && item.variation_types.length > 0
  const hasAddons = item.addons.length > 0
  const hasCustomizations = hasVariations || hasVariationTypes || hasAddons

  // Calculate total price based on which variation system is used
  const totalPrice = useNewVariations
    ? calculateCartItemSubtotal(basePrice, selectedVariations, selectedAddons, quantity)
    : calculateCartItemSubtotal(basePrice, selectedVariation, selectedAddons, quantity)

  const handleAddToCart = () => {
    // Check if required variation types have selections
    if (useNewVariations && item.variation_types) {
      const missingRequired = item.variation_types.find(
        type => type.is_required && !selectedVariations[type.id]
      )
      if (missingRequired) {
        toast.error(`Please select ${missingRequired.name}`)
        return
      }
    }

    // Pass the appropriate variation format
    const variationData = useNewVariations ? selectedVariations : selectedVariation
    onAddToCart(item, variationData, selectedAddons, quantity, specialInstructions)
    toast.success(`Added ${item.name} to cart`)
    handleOpenChange(false)
  }

  const toggleAddon = (addon: Addon) => {
    setSelectedAddons((prev) => {
      const exists = prev.find((a) => a.id === addon.id)
      if (exists) {
        return prev.filter((a) => a.id !== addon.id)
      }
      return [...prev, addon]
    })
  }

  // Compact, minimal modal design - only show what's needed
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent 
        className="!fixed w-[calc(100%-2rem)] max-w-md sm:max-w-lg flex flex-col p-0 gap-0 overflow-hidden rounded-2xl sm:rounded-3xl !left-1/2 !-translate-x-1/2 !m-0 border shadow-2xl !bottom-4 sm:!top-1/2 sm:!bottom-auto sm:!-translate-y-1/2 h-[90vh] sm:h-auto sm:max-h-[85vh]"
        showCloseButton={false}
        style={{ backgroundColor: branding.modalBackground }}
      >
        <DialogTitle className="sr-only">{item.name}</DialogTitle>
        
        {/* Scrollable Container - Includes everything except footer */}
        <div className="flex-1 overflow-y-auto overscroll-contain" style={{ minHeight: 0 }}>
          {/* Compact Header - Image Left, Info Right */}
          <div className="sticky top-0 z-10" style={{ backgroundColor: branding.modalBackground }}>
            <div className="relative">
              <button
                onClick={() => handleOpenChange(false)}
                className="absolute top-3 right-3 bg-white/95 backdrop-blur-sm rounded-full p-2 hover:bg-white transition-colors shadow-md z-20"
                aria-label="Close"
              >
                <X className="h-4 w-4 text-gray-900" />
              </button>
              
              <div className="flex gap-4 p-4 sm:p-6 border-b border-gray-100">
                {/* Image - Left Side */}
                <div className="relative w-28 h-28 sm:w-32 sm:h-32 flex-shrink-0 rounded-xl overflow-hidden bg-gray-100">
                  <Image
                    src={item.image_url}
                    alt={item.name}
                    fill
                    className="object-cover"
                    sizes="128px"
                    priority
                  />
                  {hasDiscount && (
                    <div className="absolute top-2 right-2 bg-red-500 text-white px-2 py-0.5 rounded-full text-xs font-semibold shadow-lg">
                      Sale
                    </div>
                  )}
                </div>

                {/* Info - Right Side */}
                <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
                  {/* Top: Title */}
                  <div>
                    <h1 
                      className="text-lg sm:text-xl font-bold line-clamp-2 mb-1.5"
                      style={{ color: branding.modalTitle }}
                    >
                      {item.name}
                    </h1>
                    {item.description && (
                      <p className="text-xs sm:text-sm line-clamp-2 leading-relaxed"
                        style={{ color: branding.modalDescription }}
                      >
                        {item.description}
                      </p>
                    )}
                  </div>
                  
                  {/* Bottom: Price */}
                  <div className="mt-2">
                    {hasDiscount && (
                      <div className="text-xs text-gray-400 line-through mb-0.5">
                        {formatPrice(item.price)}
                      </div>
                    )}
                    <div 
                      className="text-xl sm:text-2xl font-bold"
                      style={{ color: branding.modalPrice }}
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
            <div className="bg-white">
              <div className="p-4 sm:p-6 space-y-5 pb-6">
              {/* New Grouped Variation Types */}
              {hasVariationTypes && item.variation_types && item.variation_types.map((variationType) => {
                const selectedOption = selectedVariations[variationType.id]
                
                return (
                  <div key={variationType.id} className="scroll-mt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <h3 className="text-sm sm:text-base font-semibold text-gray-900">
                        {variationType.name}
                      </h3>
                      {variationType.is_required && (
                        <span className="text-red-500 text-xs font-medium bg-red-50 px-2 py-0.5 rounded">
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
                                  : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                                }
                              `}
                              style={isSelected ? { 
                                borderColor: branding.primary,
                                ['--tw-ring-color' as string]: `${branding.primary}30`
                              } : {}}
                            >
                              {/* Option Image */}
                              {option.image_url && (
                                <div className="relative w-full aspect-square bg-gray-100">
                                  <Image
                                    src={option.image_url}
                                    alt={option.name}
                                    fill
                                    className="object-cover"
                                    sizes="(max-width: 640px) 50vw, 33vw"
                                  />
                                  {isSelected && (
                                    <div 
                                      className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center shadow-lg"
                                      style={{ backgroundColor: branding.primary }}
                                    >
                                      <svg className="h-3.5 w-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                      </svg>
                                    </div>
                                  )}
                                </div>
                              )}
                              {/* Option Details */}
                              <div className={`p-2.5 text-center ${isSelected ? 'text-white' : 'bg-white'}`}
                                style={isSelected ? { backgroundColor: branding.primary } : {}}>
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
                                  ? 'text-white shadow-md' 
                                  : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                                }
                              `}
                              style={isSelected ? { 
                                backgroundColor: branding.primary,
                              } : {}}
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
              {!useNewVariations && hasVariations && (
                <div className="scroll-mt-4">
                  <h3 className="text-sm sm:text-base font-semibold mb-3 text-gray-900">
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
                              ? 'text-white shadow-md' 
                              : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                            }
                          `}
                          style={isSelected ? { 
                            backgroundColor: branding.primary,
                          } : {}}
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

              {/* Add-ons */}
              {hasAddons && (
                <div className="scroll-mt-4">
                  <h3 className="text-sm sm:text-base font-semibold mb-3 text-gray-900">
                    Add-ons <span className="text-xs font-normal text-gray-500">(Optional)</span>
                  </h3>
                  <div className="space-y-2">
                    {item.addons.map((addon) => {
                      const isSelected = selectedAddons.some((a) => a.id === addon.id)

                      return (
                        <button
                          key={addon.id}
                          type="button"
                          onClick={() => toggleAddon(addon)}
                          className={`
                            w-full flex items-center justify-between p-3 sm:p-3.5 rounded-lg border-2 transition-all active:scale-[0.98]
                            ${isSelected 
                              ? 'border-[currentColor] shadow-sm' 
                              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                            }
                          `}
                          style={isSelected ? { 
                            color: branding.primary,
                            borderColor: branding.primary,
                            backgroundColor: `${branding.primary}08`
                          } : { backgroundColor: 'white' }}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`
                              h-5 w-5 rounded border-2 flex items-center justify-center transition-all flex-shrink-0
                              ${isSelected 
                                ? 'border-[currentColor] bg-[currentColor]' 
                                : 'border-gray-300'
                              }
                            `}>
                              {isSelected && (
                                <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </div>
                            <span className={`text-sm font-medium truncate ${isSelected ? '' : 'text-gray-900'}`}>
                              {addon.name}
                            </span>
                          </div>
                          <span className={`text-sm font-semibold flex-shrink-0 ml-2 ${isSelected ? '' : 'text-gray-700'}`}>
                            {addon.price === 0 ? 'Free' : `+${formatPrice(addon.price)}`}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              </div>
            </div>
          )}
        </div>

        {/* Footer - Always visible, sticky */}
        <div className="flex-shrink-0 bg-white border-t border-gray-200 px-4 sm:px-6 py-3 sm:py-4 shadow-[0_-4px_12px_-2px_rgba(0,0,0,0.1)]">
          <div className="flex items-center gap-3">
            {/* Quantity - Compact */}
            <div className="flex items-center gap-1.5 bg-gray-100 rounded-xl px-1.5 flex-shrink-0">
              <button
                type="button"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
                className="h-10 w-10 rounded-lg flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white active:scale-95 transition-all touch-manipulation"
                aria-label="Decrease quantity"
              >
                <Minus className="h-4 w-4 text-gray-700" />
              </button>
              <span className="w-8 text-center text-base font-semibold text-gray-900 select-none">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity(quantity + 1)}
                className="h-10 w-10 rounded-lg flex items-center justify-center hover:bg-white active:scale-95 transition-all touch-manipulation"
                aria-label="Increase quantity"
              >
                <Plus className="h-4 w-4 text-gray-700" />
              </button>
            </div>
            
            {/* Add to Cart - Primary button */}
            <Button 
              type="button"
              onClick={handleAddToCart}
              className="flex-1 h-12 rounded-xl font-semibold text-sm sm:text-base shadow-md hover:shadow-lg active:scale-[0.98] transition-all touch-manipulation" 
              style={{ 
                backgroundColor: branding.buttonPrimary,
                color: branding.buttonPrimaryText
              }}
            >
              <span className="flex items-center justify-center gap-2">
                <span>Add to Cart</span>
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
