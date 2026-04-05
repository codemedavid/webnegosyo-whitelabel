'use client'

import { Lightbulb, ShoppingBag } from 'lucide-react'
import { WizardItemGrid } from '@/components/admin/wizard-item-grid'
import { formatPrice } from '@/lib/cart-utils'
import type { MenuItem } from '@/types/database'
import type { PriceBadge } from '@/components/admin/wizard-item-grid'

interface MenuItemWithCategory extends MenuItem {
  category: { id: string; name: string } | null
}

export interface WizardStepTargetProps {
  items: MenuItemWithCategory[]
  sourceItem: MenuItemWithCategory
  selectedItemId: string | null
  onSelect: (itemId: string) => void
}

export function WizardStepTarget({
  items,
  sourceItem,
  selectedItemId,
  onSelect,
}: WizardStepTargetProps) {
  const getPriceBadge = (item: MenuItemWithCategory): PriceBadge | null => {
    const diff = item.price - sourceItem.price
    if (diff > 0) return { label: `+${formatPrice(diff)}`, variant: 'positive' }
    if (diff < 0) return { label: `-${formatPrice(Math.abs(diff))}`, variant: 'negative' }
    return null
  }

  return (
    <div>
      {/* Pinned Source Item */}
      <div className="border-b bg-muted/30 px-4 py-3 sm:px-5">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Basic item selected
        </p>
        <div className="flex items-center gap-3 rounded-lg border bg-background p-2.5">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
            {sourceItem.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={sourceItem.image_url}
                alt={sourceItem.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ShoppingBag className="h-4 w-4 text-muted-foreground/40" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">{sourceItem.name}</p>
            <p className="text-xs font-medium text-green-600">
              {formatPrice(sourceItem.price)}
            </p>
          </div>
          <span className="text-lg text-muted-foreground">→</span>
          <span className="text-xs font-semibold text-primary">
            suggest upgrading to...
          </span>
        </div>
      </div>

      {/* Explainer */}
      <div className="mx-4 mt-4 flex gap-3 rounded-lg bg-green-50 p-3.5 dark:bg-green-950/30 sm:mx-5">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
        <div>
          <p className="text-sm font-semibold text-green-800 dark:text-green-300">
            Pick the upgrade
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-green-700 dark:text-green-400">
            Choose a higher-value item to suggest — like a meal combo instead of
            a single burger. The price difference is what motivates the upgrade.
          </p>
        </div>
      </div>

      {/* Item Grid with price badges */}
      <WizardItemGrid
        items={items}
        selectedItemId={selectedItemId}
        onSelect={onSelect}
        disabledItemId={sourceItem.id}
        disabledLabel="Already selected"
        getPriceBadge={getPriceBadge}
      />
    </div>
  )
}
