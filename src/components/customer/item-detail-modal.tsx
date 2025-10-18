'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Minus, Plus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import type { MenuItem, Variation, Addon } from '@/types/database'
import { formatPrice, calculateCartItemSubtotal } from '@/lib/cart-utils'
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
  primaryColor?: string
}

export function ItemDetailModal({
  item,
  open,
  onClose,
  onAddToCart,
  primaryColor,
}: ItemDetailModalProps) {
  // Silence unused var warning - primaryColor kept for future customization
  void primaryColor
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
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">{item.name}</DialogTitle>
          <DialogDescription>{item.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Item Image */}
          <div className="relative aspect-video w-full overflow-hidden rounded-lg">
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

          {/* Price */}
          <div className="flex items-center gap-3">
            {hasDiscount && (
              <span className="text-lg text-muted-foreground line-through">
                {formatPrice(item.price)}
              </span>
            )}
            <span className="text-2xl font-bold text-primary">
              {formatPrice(basePrice)}
            </span>
          </div>

          <Separator />

          {/* Variations */}
          {item.variations.length > 0 && (
            <div className="space-y-3">
              <Label className="text-base font-semibold">Size</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {item.variations.map((variation) => {
                  const isSelected = selectedVariation?.id === variation.id
                  const price = basePrice + variation.price_modifier

                  return (
                    <Button
                      key={variation.id}
                      variant={isSelected ? 'default' : 'outline'}
                      className="h-auto flex-col py-3"
                      onClick={() => setSelectedVariation(variation)}
                    >
                      <span className="font-medium">{variation.name}</span>
                      <span className="text-xs">
                        {variation.price_modifier === 0
                          ? formatPrice(price)
                          : `+${formatPrice(variation.price_modifier)}`}
                      </span>
                    </Button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Add-ons */}
          {item.addons.length > 0 && (
            <div className="space-y-3">
              <Label className="text-base font-semibold">Add-ons (Optional)</Label>
              <div className="space-y-2">
                {item.addons.map((addon) => {
                  const isSelected = selectedAddons.some((a) => a.id === addon.id)

                  return (
                    <Button
                      key={addon.id}
                      variant={isSelected ? 'secondary' : 'outline'}
                      className="w-full justify-between"
                      onClick={() => toggleAddon(addon)}
                    >
                      <span>{addon.name}</span>
                      <span className="text-sm">
                        {addon.price === 0 ? 'Free' : `+${formatPrice(addon.price)}`}
                      </span>
                    </Button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Special Instructions */}
          <div className="space-y-3">
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
          </div>

          <Separator />

          {/* Quantity and Add to Cart */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Label className="font-semibold">Quantity</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  disabled={quantity <= 1}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="w-12 text-center text-lg font-semibold">
                  {quantity}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setQuantity(quantity + 1)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Button size="lg" className="min-w-[180px]" onClick={handleAddToCart}>
              Add to Cart • {formatPrice(totalPrice)}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

