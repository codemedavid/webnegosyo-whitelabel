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
import type { MenuItem, Variation, Addon } from '@/types/database'
import { formatPrice, calculateCartItemSubtotal } from '@/lib/cart-utils'
import type { BrandingColors } from '@/lib/branding-utils'
import { toast } from 'sonner'

interface ItemDetailModalProps {
  item: MenuItem | null
  open: boolean
  onClose: () => void
  onAddToCart: (
    item: MenuItem,
    variation: Variation | undefined,
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
  const [selectedVariation, setSelectedVariation] = useState<Variation | undefined>()
  const [selectedAddons, setSelectedAddons] = useState<Addon[]>([])
  const [quantity, setQuantity] = useState(1)
  const [specialInstructions, setSpecialInstructions] = useState('')

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedVariation(item?.variations.find((v) => v.is_default))
      setSelectedAddons([])
      setQuantity(1)
      setSpecialInstructions('')
      onClose()
    }
  }

  useEffect(() => {
    if (item && item.variations.length > 0 && !selectedVariation) {
      const defaultVar = item.variations.find((v) => v.is_default) || item.variations[0]
      setSelectedVariation(defaultVar)
    }
  }, [item, selectedVariation])

  if (!item) return null

  const hasDiscount = item.discounted_price && item.discounted_price < item.price
  const basePrice = hasDiscount ? item.discounted_price! : item.price
  const hasVariations = item.variations.length > 0
  const hasAddons = item.addons.length > 0
  const hasCustomizations = hasVariations || hasAddons

  const totalPrice = calculateCartItemSubtotal(
    basePrice,
    selectedVariation,
    selectedAddons,
    quantity
  )

  const handleAddToCart = () => {
    onAddToCart(item, selectedVariation, selectedAddons, quantity, specialInstructions)
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
              {/* Variations */}
              {hasVariations && (
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
