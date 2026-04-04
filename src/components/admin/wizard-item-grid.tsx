'use client'

import { useState, useMemo } from 'react'
import { Search, ShoppingBag } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { formatPrice } from '@/lib/cart-utils'
import { cn } from '@/lib/utils'
import type { MenuItem } from '@/types/database'

interface MenuItemWithCategory extends MenuItem {
  category: { id: string; name: string } | null
}

export interface PriceBadge {
  label: string
  variant: 'positive' | 'negative' | 'neutral'
}

export interface WizardItemGridProps {
  items: MenuItemWithCategory[]
  selectedItemId: string | null
  onSelect: (itemId: string) => void
  disabledItemId?: string | null
  disabledLabel?: string
  getPriceBadge?: (item: MenuItemWithCategory) => PriceBadge | null
}

export function WizardItemGrid({
  items,
  selectedItemId,
  onSelect,
  disabledItemId,
  disabledLabel = 'Already selected',
  getPriceBadge,
}: WizardItemGridProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const categories = useMemo(() => {
    const cats = new Map<string, string>()
    for (const item of items) {
      if (item.category) {
        cats.set(item.category.id, item.category.name)
      }
    }
    return Array.from(cats, ([id, name]) => ({ id, name }))
  }, [items])

  const filteredItems = useMemo(() => {
    let result = items
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter((item) => item.name.toLowerCase().includes(q))
    }
    if (activeCategory) {
      result = result.filter((item) => item.category?.id === activeCategory)
    }
    return result
  }, [items, searchQuery, activeCategory])

  return (
    <div>
      {/* Search */}
      <div className="px-4 pt-4 pb-2 sm:px-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search menu items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Category Pills */}
      {categories.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-2 sm:px-5">
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              activeCategory === null
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                activeCategory === cat.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Item Grid */}
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 sm:px-5">
        {filteredItems.map((item) => {
          const isDisabled = item.id === disabledItemId
          const isSelected = item.id === selectedItemId
          const badge = getPriceBadge?.(item)

          return (
            <button
              key={item.id}
              type="button"
              disabled={isDisabled}
              onClick={() => onSelect(item.id)}
              className={cn(
                'relative overflow-hidden rounded-xl border text-left transition-all',
                isDisabled && 'cursor-not-allowed opacity-35',
                isSelected &&
                  'border-primary ring-2 ring-primary/20 shadow-sm',
                !isSelected && !isDisabled && 'border-border hover:border-primary/40 hover:shadow-sm',
              )}
            >
              {/* Selection checkmark */}
              {isSelected && (
                <div className="absolute right-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}

              {/* Price badge */}
              {badge && !isDisabled && (
                <div
                  className={cn(
                    'absolute left-2 top-2 z-10 rounded-full px-2 py-0.5 text-[11px] font-bold text-white',
                    badge.variant === 'positive' && 'bg-green-500',
                    badge.variant === 'negative' && 'bg-amber-500',
                    badge.variant === 'neutral' && 'bg-muted-foreground',
                  )}
                >
                  {badge.label}
                </div>
              )}

              {/* Image */}
              <div className="aspect-[4/3] w-full bg-muted">
                {item.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ShoppingBag className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-2.5">
                {isDisabled ? (
                  <>
                    <p className="text-xs font-medium truncate">{item.name}</p>
                    <p className="text-[11px] text-muted-foreground">{disabledLabel}</p>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-medium truncate">{item.name}</p>
                    <p className="text-xs font-semibold text-green-600 mt-0.5">
                      {formatPrice(item.price)}
                    </p>
                  </>
                )}
              </div>
            </button>
          )
        })}

        {filteredItems.length === 0 && (
          <div className="col-span-full py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {searchQuery ? 'No items match your search.' : 'No available items.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
