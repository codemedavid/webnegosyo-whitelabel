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
        className="!fixed w-full max-w-md sm:max-w-lg h-auto max-h-[90vh] p-0 gap-0 overflow-hidden rounded-2xl sm:rounded-3xl !bottom-4 sm:!bottom-auto !left-1/2 !right-auto !top-auto sm:!top-[50%] !-translate-x-1/2 sm:!translate-y-[-50%] !m-0 border shadow-2xl"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">{item.name}</DialogTitle>
        
        {/* Header with Image */}
        <div className="relative">
          <div className="relative w-full aspect-[16/10] sm:aspect-[16/9] bg-gray-100">
            <Image
              src={item.image_url}
              alt={item.name}
              fill
              className="object-cover rounded-t-2xl sm:rounded-t-3xl"
              sizes="(max-width: 640px) 100vw, 512px"
              priority
            />
            {hasDiscount && (
              <div className="absolute top-3 right-3 bg-red-500 text-white px-2.5 py-1 rounded-full text-xs font-semibold">
                Sale
              </div>
            )}
            <button
              onClick={() => handleOpenChange(false)}
              className="absolute top-3 left-3 bg-white/95 backdrop-blur-sm rounded-full p-2 hover:bg-white transition-colors shadow-md"
              aria-label="Close"
            >
              <X className="h-4 w-4 text-gray-900" />
            </button>
          </div>
          
          {/* Title and Price - Compact */}
          <div className="px-4 pt-4 pb-3 bg-white border-b border-gray-100">
            <div className="flex items-start justify-between gap-3">
              <h1 
                className="text-xl font-bold flex-1 line-clamp-2"
                style={{ color: branding.textPrimary || '#1a1a1a' }}
              >
                {item.name}
              </h1>
              <div className="text-right flex-shrink-0">
                {hasDiscount && (
                  <div className="text-xs text-gray-400 line-through mb-0.5">
                    {formatPrice(item.price)}
                  </div>
                )}
                <div 
                  className="text-xl font-bold"
                  style={{ color: branding.primary }}
                >
                  {formatPrice(basePrice)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Options - Only show if there are customizations */}
        {hasCustomizations && (
          <div className="overflow-y-auto bg-white" style={{ maxHeight: 'calc(90vh - 200px)' }}>
            <div className="p-4 space-y-4">
              {/* New Grouped Variation Types */}
              {hasVariationTypes && item.variation_types && item.variation_types.map((variationType) => {
                const selectedOption = selectedVariations[variationType.id]
                
                return (
                  <div key={variationType.id}>
                    <h3 className="text-sm font-semibold mb-2.5 text-gray-700">
                      {variationType.name}
                      {variationType.is_required && <span className="text-red-500 ml-1">*</span>}
                    </h3>
                    
                    {/* Show as image grid if any option has an image */}
                    {variationType.options.some(opt => opt.image_url) ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {variationType.options.map((option) => {
                          const isSelected = selectedOption?.id === option.id
                          const price = basePrice + option.price_modifier

                          return (
                            <button
                              key={option.id}
                              onClick={() => setSelectedVariations(prev => ({ ...prev, [variationType.id]: option }))}
                              className={`
                                relative rounded-lg overflow-hidden transition-all border-2
                                ${isSelected 
                                  ? 'shadow-md' 
                                  : 'border-gray-200 hover:border-gray-300'
                                }
                              `}
                              style={isSelected ? { 
                                borderColor: branding.primary,
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
                                      className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                                      style={{ backgroundColor: branding.primary }}
                                    >
                                      <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                      </svg>
                                    </div>
                                  )}
                                </div>
                              )}
                              {/* Option Details */}
                              <div className={`p-2 text-center ${isSelected ? 'text-white' : 'bg-white'}`}
                                style={isSelected ? { backgroundColor: branding.primary } : {}}>
                                <div className="font-semibold text-sm">{option.name}</div>
                                <div className="text-xs opacity-90 mt-0.5">
                                  {option.price_modifier === 0
                                    ? formatPrice(price)
                                    : `+${formatPrice(option.price_modifier)}`}
                                </div>
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
                          const price = basePrice + option.price_modifier

                          return (
                            <button
                              key={option.id}
                              onClick={() => setSelectedVariations(prev => ({ ...prev, [variationType.id]: option }))}
                              className={`
                                px-3 py-2 rounded-lg text-sm font-medium transition-all min-w-[80px]
                                ${isSelected 
                                  ? 'text-white shadow-sm' 
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }
                              `}
                              style={isSelected ? { 
                                backgroundColor: branding.primary,
                              } : {}}
                            >
                              <div className="text-center">
                                <div className="font-semibold">{option.name}</div>
                                <div className="text-xs opacity-90 mt-0.5">
                                  {option.price_modifier === 0
                                    ? formatPrice(price)
                                    : `+${formatPrice(option.price_modifier)}`}
                                </div>
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
                <div>
                  <h3 className="text-sm font-semibold mb-2.5 text-gray-700">
                    Choose Size
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {item.variations.map((variation) => {
                      const isSelected = selectedVariation?.id === variation.id
                      const price = basePrice + variation.price_modifier

                      return (
                        <button
                          key={variation.id}
                          onClick={() => setSelectedVariation(variation)}
                          className={`
                            px-3 py-2 rounded-lg text-sm font-medium transition-all min-w-[80px]
                            ${isSelected 
                              ? 'text-white shadow-sm' 
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }
                          `}
                          style={isSelected ? { 
                            backgroundColor: branding.primary,
                          } : {}}
                        >
                          <div className="text-center">
                            <div className="font-semibold">{variation.name}</div>
                            <div className="text-xs opacity-90 mt-0.5">
                              {variation.price_modifier === 0
                                ? formatPrice(price)
                                : `+${formatPrice(variation.price_modifier)}`}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Add-ons */}
              {hasAddons && (
                <div>
                  <h3 className="text-sm font-semibold mb-2.5 text-gray-700">
                    Add-ons
                  </h3>
                  <div className="space-y-2">
                    {item.addons.map((addon) => {
                      const isSelected = selectedAddons.some((a) => a.id === addon.id)

                      return (
                        <button
                          key={addon.id}
                          onClick={() => toggleAddon(addon)}
                          className={`
                            w-full flex items-center justify-between p-3 rounded-lg border transition-all
                            ${isSelected 
                              ? 'border-[currentColor]' 
                              : 'border-gray-200 hover:border-gray-300'
                            }
                          `}
                          style={isSelected ? { 
                            color: branding.primary,
                            borderColor: branding.primary,
                            backgroundColor: `${branding.primary}08`
                          } : { backgroundColor: 'white' }}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className={`
                              h-4 w-4 rounded border-2 flex items-center justify-center transition-all flex-shrink-0
                              ${isSelected 
                                ? 'border-[currentColor] bg-[currentColor]' 
                                : 'border-gray-300'
                              }
                            `}>
                              {isSelected && (
                                <svg className="h-2.5 w-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </div>
                            <span className={`text-sm font-medium ${isSelected ? '' : 'text-gray-900'}`}>
                              {addon.name}
                            </span>
                          </div>
                          <span className={`text-sm font-medium ${isSelected ? '' : 'text-gray-600'}`}>
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

        {/* Footer - Always visible */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-3 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
          <div className="flex items-center gap-2.5">
            {/* Quantity - Compact */}
            <div className="flex items-center gap-1.5 bg-gray-100 rounded-lg px-2">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
                className="h-9 w-9 rounded-lg flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white transition-colors"
                aria-label="Decrease quantity"
              >
                <Minus className="h-4 w-4 text-gray-700" />
              </button>
              <span className="w-7 text-center text-sm font-semibold text-gray-900">
                {quantity}
              </span>
              <button
                onClick={() => setQuantity(quantity + 1)}
                className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-white transition-colors"
                aria-label="Increase quantity"
              >
                <Plus className="h-4 w-4 text-gray-700" />
              </button>
            </div>
            
            {/* Add to Cart - Primary button */}
            <Button 
              onClick={handleAddToCart}
              className="flex-1 h-11 rounded-lg font-semibold text-sm shadow-md hover:shadow-lg transition-all" 
              style={{ 
                backgroundColor: branding.primary,
                color: branding.buttonPrimaryText || '#ffffff'
              }}
            >
              Add to Cart • {formatPrice(totalPrice)}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
