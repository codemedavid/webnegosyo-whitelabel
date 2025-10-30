'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Minus, Plus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
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

  // Reset state when modal opens with new item
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedVariation(item?.variations.find((v) => v.is_default))
      setSelectedAddons([])
      setQuantity(1)
      setSpecialInstructions('')
      onClose()
    }
  }

  if (!item) return null

  // Set default variation if not set
  if (!selectedVariation && item.variations.length > 0) {
    const defaultVar = item.variations.find((v) => v.is_default) || item.variations[0]
    setSelectedVariation(defaultVar)
  }

  const hasDiscount = item.discounted_price && item.discounted_price < item.price
  const basePrice = hasDiscount ? item.discounted_price! : item.price

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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[calc(100vw-32px)] sm:max-w-lg md:max-w-xl lg:max-w-2xl max-h-[90vh] p-0 overflow-hidden rounded-2xl">
        {/* Hidden title for accessibility */}
        <DialogTitle className="sr-only">{item.name}</DialogTitle>
        {/* Top grabber */}
        <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-muted" />

        {/* Scrollable content area */}
        <div className="max-h-[calc(90vh-92px)] overflow-y-auto">
          {/* Hero image */}
          <div className="relative aspect-[16/10] w-full overflow-hidden">
            <Image
              src={item.image_url}
              alt={item.name}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 672px"
            />
            {hasDiscount && (
              <Badge className="absolute right-2 top-2" variant="destructive">
                Sale
              </Badge>
            )}
          </div>
          {/* Content sections */}
          <div className="px-4 pt-4 pb-2 sm:px-6 sm:pt-6 sm:pb-4 space-y-6">
            {/* Title + Price row */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight" style={{ color: branding.textPrimary }}>
                  {item.name}
                </h1>
                {item.description && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.description}
                  </p>
                )}
              </div>
              <div className="text-right">
                {hasDiscount && (
                  <div className="text-sm text-muted-foreground line-through">
                    {formatPrice(item.price)}
                  </div>
                )}
                <div className="text-2xl font-bold" style={{ color: branding.primary }}>
                  {formatPrice(basePrice)}
                </div>
              </div>
            </div>

            <Separator />

            {/* Variations */}
            {item.variations.length > 0 && (
              <section className="space-y-3">
                <Label className="text-base font-semibold">Choose a size</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {item.variations.map((variation) => {
                    const isSelected = selectedVariation?.id === variation.id
                    const price = basePrice + variation.price_modifier

                    return (
                      <button
                        key={variation.id}
                        onClick={() => setSelectedVariation(variation)}
                        data-selected={isSelected}
                        className="rounded-full border px-4 py-2 text-sm font-medium transition-colors data-[selected=true]:border-primary data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary"
                      >
                        <span>{variation.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {variation.price_modifier === 0
                            ? formatPrice(price)
                            : `+${formatPrice(variation.price_modifier)}`}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            {/* Add-ons */}
            {item.addons.length > 0 && (
              <section className="space-y-3">
                <Label className="text-base font-semibold">Add-ons</Label>
                <div className="space-y-2">
                  {item.addons.map((addon) => {
                    const isSelected = selectedAddons.some((a) => a.id === addon.id)

                    return (
                      <button
                        key={addon.id}
                        onClick={() => toggleAddon(addon)}
                        data-selected={isSelected}
                        className="flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors data-[selected=true]:border-primary data-[selected=true]:bg-primary/5"
                      >
                        <span className="font-medium">{addon.name}</span>
                        <span className="text-sm text-muted-foreground">
                          {addon.price === 0 ? 'Free' : `+${formatPrice(addon.price)}`}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            {/* Special Instructions */}
            <section className="space-y-3">
              <Label htmlFor="instructions" className="text-base font-semibold">
                Special Instructions
              </Label>
              <Textarea
                id="instructions"
                placeholder="Any special requests? (e.g., no onions, extra sauce)"
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
                rows={3}
              />
            </section>
          </div>
        </div>

        {/* Sticky Action Bar */}
        <div className="border-t bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70 px-4 py-3 sm:px-6 sm:py-4 pb-[max(12px,env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
                className="h-9 w-9"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-10 text-center text-base font-semibold">
                {quantity}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setQuantity(quantity + 1)}
                className="h-9 w-9"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <Button size="lg" className="ml-auto h-11 rounded-full w-full sm:w-auto min-w-[180px]" onClick={handleAddToCart}>
              Add to Cart • {formatPrice(totalPrice)}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

