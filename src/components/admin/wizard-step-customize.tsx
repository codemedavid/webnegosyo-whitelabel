'use client'

import { memo, useCallback } from 'react'
import { Pencil, Eye, ShoppingBag } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/cart-utils'
import type { MenuItem, MenuItemWithCategory } from '@/types/database'

export interface WizardStepCustomizeProps {
  sourceItem: MenuItemWithCategory
  targetItem: MenuItemWithCategory
  upgradeHeader: string
  sourceLabel: string
  targetLabel: string
  onUpgradeHeaderChange: (value: string) => void
  onSourceLabelChange: (value: string) => void
  onTargetLabelChange: (value: string) => void
}

function ItemImage({ item, size = 'md' }: { item: MenuItem; size?: 'sm' | 'md' }) {
  const sizeClass = size === 'sm' ? 'h-10 w-10' : 'h-12 w-12'

  return (
    <div className={`${sizeClass} shrink-0 overflow-hidden rounded-lg bg-muted`}>
      {item.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.image_url}
          alt={item.name}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <ShoppingBag className="h-4 w-4 text-muted-foreground/40" />
        </div>
      )}
    </div>
  )
}

export const WizardStepCustomize = memo(function WizardStepCustomize({
  sourceItem,
  targetItem,
  upgradeHeader,
  sourceLabel,
  targetLabel,
  onUpgradeHeaderChange,
  onSourceLabelChange,
  onTargetLabelChange,
}: WizardStepCustomizeProps) {
  const priceDiff = targetItem.price - sourceItem.price
  const displayHeader = upgradeHeader || `Upgrade your ${sourceItem.name}?`
  const displaySourceLabel = sourceLabel || 'Ala Carte'
  const displayTargetLabel = targetLabel || 'Meal'

  const handleHeaderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onUpgradeHeaderChange(e.target.value),
    [onUpgradeHeaderChange]
  )
  const handleSourceLabelChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onSourceLabelChange(e.target.value),
    [onSourceLabelChange]
  )
  const handleTargetLabelChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onTargetLabelChange(e.target.value),
    [onTargetLabelChange]
  )

  return (
    <div className="space-y-0">
      {/* Pair Summary */}
      <div className="border-b bg-muted/30 px-4 py-4 sm:px-5">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Your upgrade pair
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          {/* Source */}
          <div className="flex flex-1 items-center gap-3 rounded-lg border bg-background p-3">
            <ItemImage item={sourceItem} />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase text-muted-foreground">
                Basic
              </p>
              <p className="text-sm font-semibold truncate">{sourceItem.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatPrice(sourceItem.price)}
              </p>
            </div>
          </div>

          {/* Arrow + Price Diff */}
          <div className="flex shrink-0 flex-col items-center gap-1">
            <span className="text-xl text-primary">→</span>
            {priceDiff > 0 && (
              <span className="rounded-full bg-green-500 px-2.5 py-0.5 text-[11px] font-bold text-white">
                +{formatPrice(priceDiff)}
              </span>
            )}
          </div>

          {/* Target */}
          <div className="flex flex-1 items-center gap-3 rounded-lg border-2 border-primary bg-background p-3">
            <ItemImage item={targetItem} />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase text-primary">
                Upgrade
              </p>
              <p className="text-sm font-semibold truncate">{targetItem.name}</p>
              <p className="text-xs font-medium text-green-600">
                {formatPrice(targetItem.price)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Customize Labels */}
      <div className="px-4 py-5 sm:px-5">
        <div className="mb-4 flex items-center gap-2">
          <Pencil className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">
            Customize labels{' '}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </h3>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="wiz-header" className="text-xs">
              Header text
            </Label>
            <Input
              id="wiz-header"
              placeholder="e.g. Want to make it a meal?"
              value={upgradeHeader}
              onChange={handleHeaderChange}
              maxLength={100}
            />
            <p className="text-[11px] text-muted-foreground">
              Shown as the title when suggesting the upgrade
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="wiz-source-label" className="text-xs">
                Basic item label
              </Label>
              <Input
                id="wiz-source-label"
                placeholder="e.g. Ala Carte"
                value={sourceLabel}
                onChange={handleSourceLabelChange}
                maxLength={50}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wiz-target-label" className="text-xs">
                Upgrade item label
              </Label>
              <Input
                id="wiz-target-label"
                placeholder="e.g. Meal"
                value={targetLabel}
                onChange={handleTargetLabelChange}
                maxLength={50}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-border sm:mx-5" />

      {/* Live Preview */}
      <div className="px-4 py-5 sm:px-5">
        <div className="mb-4 flex items-center gap-2">
          <Eye className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Customer preview</h3>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            Live
          </span>
        </div>

        {/* Simulated Customer Modal */}
        <div className="overflow-hidden rounded-xl border-2 border-dashed border-primary/30 bg-background">
          <div className="px-5 pt-5 pb-3 text-center">
            <p className="text-lg font-bold">{displayHeader}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 px-5 pb-5">
            {/* Source Preview Card */}
            <div className="overflow-hidden rounded-xl border-2 border-muted text-center">
              <div className="aspect-[4/3] w-full bg-muted">
                {sourceItem.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={sourceItem.image_url}
                    alt={sourceItem.name}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ShoppingBag className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                )}
              </div>
              <div className="p-3">
                <Badge variant="secondary" className="mb-1.5 text-[10px]">
                  {displaySourceLabel}
                </Badge>
                <p className="text-xs font-semibold truncate">{sourceItem.name}</p>
                <p className="mt-0.5 text-sm font-bold">
                  {formatPrice(sourceItem.price)}
                </p>
              </div>
            </div>

            {/* Target Preview Card */}
            <div className="relative overflow-hidden rounded-xl border-2 border-green-500 text-center shadow-sm">
              {priceDiff > 0 && (
                <div className="absolute right-2 top-2 z-10 rounded-full bg-green-500 px-2 py-0.5 text-[10px] font-bold text-white">
                  +{formatPrice(priceDiff)}
                </div>
              )}
              <div className="aspect-[4/3] w-full bg-muted">
                {targetItem.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={targetItem.image_url}
                    alt={targetItem.name}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ShoppingBag className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                )}
              </div>
              <div className="p-3">
                <Badge className="mb-1.5 bg-green-500 text-[10px] hover:bg-green-500">
                  {displayTargetLabel}
                </Badge>
                <p className="text-xs font-semibold truncate">{targetItem.name}</p>
                <p className="mt-0.5 text-sm font-bold">
                  {formatPrice(targetItem.price)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})
