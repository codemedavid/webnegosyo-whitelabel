'use client'

import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardFooter, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { MenuItem } from '@/types/database'
import { formatPrice } from '@/lib/cart-utils'

interface MenuItemCardProps {
  item: MenuItem
  onSelect: (item: MenuItem) => void
}

export function MenuItemCard({ item, onSelect }: MenuItemCardProps) {
  const hasDiscount = item.discounted_price && item.discounted_price < item.price
  const displayPrice = hasDiscount ? item.discounted_price! : item.price

  return (
    <Card
      className="group overflow-hidden transition-all hover:shadow-lg cursor-pointer"
      onClick={() => onSelect(item)}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <Image
          src={item.image_url}
          alt={item.name}
          fill
          className="object-cover transition-transform group-hover:scale-105"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
        {item.is_featured && (
          <Badge className="absolute left-2 top-2" variant="secondary">
            Featured
          </Badge>
        )}
        {hasDiscount && (
          <Badge className="absolute right-2 top-2" variant="destructive">
            Sale
          </Badge>
        )}
        {!item.is_available && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <Badge variant="outline" className="bg-background/90">
              Unavailable
            </Badge>
          </div>
        )}
      </div>

      <CardContent className="p-4">
        <CardTitle className="mb-1 line-clamp-1">{item.name}</CardTitle>
        <CardDescription className="line-clamp-2 text-sm">
          {item.description}
        </CardDescription>

        <div className="mt-3 flex items-center gap-2">
          {hasDiscount && (
            <span className="text-sm text-muted-foreground line-through">
              {formatPrice(item.price)}
            </span>
          )}
          <span className="text-lg font-bold text-primary">
            {formatPrice(displayPrice)}
          </span>
        </div>

        {item.variations.length > 0 && (
          <div className="mt-2">
            <Badge variant="outline" className="text-xs">
              {item.variations.length} sizes available
            </Badge>
          </div>
        )}
      </CardContent>

      <CardFooter className="p-4 pt-0">
        <Button
          className="w-full"
          disabled={!item.is_available}
          onClick={(e) => {
            e.stopPropagation()
            onSelect(item)
          }}
        >
          {item.is_available ? 'Add to Cart' : 'Unavailable'}
        </Button>
      </CardFooter>
    </Card>
  )
}

