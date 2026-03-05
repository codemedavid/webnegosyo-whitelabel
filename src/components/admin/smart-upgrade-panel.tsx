'use client'

import { useState, useEffect, useTransition } from 'react'
import { Sparkles, Loader2, Check, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { formatPrice } from '@/lib/cart-utils'
import {
  getSmartUpgradeSuggestionsAction,
  createUpsellPairAction,
} from '@/app/actions/menu-engineering'
import type { MenuItem } from '@/types/database'

interface SmartUpgradePanelProps {
  selectedItemId: string | null
  tenantId: string
  tenantSlug: string
  menuItems: Array<MenuItem & { category?: { id: string; name: string } | null }>
}

interface BundleSuggestion {
  id: string
  name: string
  items: unknown[]
  pricing_type: string
  fixed_price?: number
  discount_percent?: number
  image_url: string
  description?: string
}

export function SmartUpgradePanel({
  selectedItemId,
  tenantId,
  tenantSlug,
  menuItems,
}: SmartUpgradePanelProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [bundles, setBundles] = useState<BundleSuggestion[]>([])
  const [categoryUpgrades, setCategoryUpgrades] = useState<MenuItem[]>([])
  const [creatingId, setCreatingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const selectedItem = menuItems.find((item) => item.id === selectedItemId)

  useEffect(() => {
    if (!selectedItemId) {
      setBundles([])
      setCategoryUpgrades([])
      return
    }

    let cancelled = false
    setIsLoading(true)

    getSmartUpgradeSuggestionsAction(selectedItemId, tenantId)
      .then((result) => {
        if (cancelled) return
        setBundles(result.bundles)
        setCategoryUpgrades(result.categoryUpgrades)
      })
      .catch(() => {
        if (cancelled) return
        toast.error('Failed to load upgrade suggestions')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedItemId, tenantId])

  const handleUseAsUpgrade = (targetItemId: string) => {
    if (!selectedItemId) return
    setCreatingId(targetItemId)

    startTransition(async () => {
      const result = await createUpsellPairAction(tenantId, tenantSlug, {
        source_item_id: selectedItemId,
        target_item_id: targetItemId,
        pair_type: 'upgrade',
      })
      setCreatingId(null)
      if (result.success) {
        toast.success('Upgrade pair created')
      } else {
        toast.error(result.error || 'Failed to create upgrade pair')
      }
    })
  }

  // Empty state: no item selected
  if (!selectedItemId) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center">
        <Sparkles className="mx-auto h-8 w-8 text-muted-foreground/50" />
        <p className="mt-2 text-sm text-muted-foreground">
          Select a source item above to see smart upgrade suggestions
        </p>
      </div>
    )
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">
          Finding upgrade suggestions...
        </p>
      </div>
    )
  }

  const hasSuggestions = bundles.length > 0 || categoryUpgrades.length > 0

  if (!hasSuggestions) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center">
        <Sparkles className="mx-auto h-8 w-8 text-muted-foreground/50" />
        <p className="mt-2 text-sm text-muted-foreground">
          No upgrade suggestions found for this item
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-amber-500" />
        <span className="text-sm font-medium">Smart Upgrade Suggestions</span>
      </div>

      {/* Bundles Section */}
      {bundles.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Bundles containing this item
          </p>
          {bundles.map((bundle) => (
            <div
              key={bundle.id}
              className="flex items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Badge variant="secondary">Bundle</Badge>
                <span className="text-sm font-medium truncate">
                  {bundle.name}
                </span>
                {bundle.pricing_type === 'fixed' && bundle.fixed_price != null && (
                  <span className="text-xs text-muted-foreground">
                    {formatPrice(bundle.fixed_price)}
                  </span>
                )}
                {bundle.pricing_type === 'discount' && bundle.discount_percent != null && (
                  <span className="text-xs text-muted-foreground">
                    {bundle.discount_percent}% off
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Category Upgrades Section */}
      {categoryUpgrades.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Higher-priced in same category
          </p>
          {categoryUpgrades.map((upgrade) => {
            const priceDiff = selectedItem
              ? upgrade.price - selectedItem.price
              : 0
            return (
              <div
                key={upgrade.id}
                className="flex items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-sm font-medium truncate">
                    {upgrade.name}
                  </span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-sm text-muted-foreground">
                    {formatPrice(upgrade.price)}
                  </span>
                  {priceDiff > 0 && (
                    <span className="text-xs font-medium text-green-600">
                      (+{formatPrice(priceDiff)})
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleUseAsUpgrade(upgrade.id)}
                  disabled={isPending && creatingId === upgrade.id}
                >
                  {isPending && creatingId === upgrade.id ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="mr-1 h-3 w-3" />
                  )}
                  Use as Upgrade
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
