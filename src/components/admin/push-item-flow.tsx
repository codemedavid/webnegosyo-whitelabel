'use client'

import { useState, useTransition, useMemo } from 'react'
import { Search, Star, Gem, TrendingDown, AlertCircle, Loader2, Check } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { formatPrice } from '@/lib/cart-utils'
import {
  getRecommendedPlacementAction,
  setBoostPriorityAction,
} from '@/app/actions/menu-engineering'
import type { MenuItem } from '@/types/database'

interface MenuItemWithCategory extends MenuItem {
  category: { id: string; name: string } | null
}

interface PushItemFlowProps {
  menuItems: MenuItemWithCategory[]
  tenantId: string
  tenantSlug: string
  itemsNotInUpsell: string[]
}

type PlacementResult = {
  placement: 'upgrade' | 'complementary' | 'checkout_pick' | 'bundle'
  reason: string
  suggestedTargets?: MenuItem[]
}

const PLACEMENT_LABELS: Record<string, { label: string; description: string }> = {
  upgrade: {
    label: 'Upgrade to Meal',
    description: 'Show when someone orders a lower-priced version',
  },
  complementary: {
    label: 'Goes well with',
    description: 'Suggest alongside mains and combos',
  },
  checkout_pick: {
    label: 'Checkout pick',
    description: 'Show before payment as an impulse add',
  },
  bundle: {
    label: 'Add to a combo',
    description: 'Include in more bundle deals',
  },
}

export function PushItemFlow({
  menuItems,
  tenantId,
  tenantSlug,
  itemsNotInUpsell,
}: PushItemFlowProps) {
  const [search, setSearch] = useState('')
  const [selectedItem, setSelectedItem] = useState<MenuItemWithCategory | null>(null)
  const [recommendation, setRecommendation] = useState<PlacementResult | null>(null)
  const [isPending, startTransition] = useTransition()

  const bcgCounts = useMemo(() => {
    const counts = { star: 0, puzzle: 0, dog: 0, noUpsell: itemsNotInUpsell.length }
    for (const item of menuItems) {
      if (item.bcg_classification === 'star') counts.star++
      else if (item.bcg_classification === 'puzzle') counts.puzzle++
      else if (item.bcg_classification === 'dog') counts.dog++
    }
    return counts
  }, [menuItems, itemsNotInUpsell])

  const filteredItems = useMemo(() => {
    if (!search) return []
    const q = search.toLowerCase()
    return menuItems
      .filter(
        (i) =>
          i.name.toLowerCase().includes(q) || i.category?.name.toLowerCase().includes(q)
      )
      .slice(0, 8)
  }, [search, menuItems])

  function handleSelectItem(item: MenuItemWithCategory) {
    setSelectedItem(item)
    setSearch('')
    startTransition(async () => {
      try {
        const result = await getRecommendedPlacementAction(item.id, tenantId)
        setRecommendation(result)
      } catch {
        toast.error('Failed to get recommendation')
      }
    })
  }

  function handleAccept() {
    if (!selectedItem || !recommendation) return
    startTransition(async () => {
      try {
        await setBoostPriorityAction(selectedItem.id, tenantId, tenantSlug, 10)
        toast.success(`${selectedItem.name} added to Boost Sales`)
        setSelectedItem(null)
        setRecommendation(null)
      } catch {
        toast.error('Failed to add item')
      }
    })
  }

  function handleReset() {
    setSelectedItem(null)
    setRecommendation(null)
    setSearch('')
  }

  const tiles = [
    {
      label: 'Best Sellers',
      count: bcgCounts.star,
      icon: Star,
      filter: 'star' as const,
      color: 'text-amber-600',
    },
    {
      label: 'Hidden Gems',
      count: bcgCounts.puzzle,
      icon: Gem,
      filter: 'puzzle' as const,
      color: 'text-purple-600',
    },
    {
      label: 'Slow Movers',
      count: bcgCounts.dog,
      icon: TrendingDown,
      filter: 'dog' as const,
      color: 'text-red-600',
    },
    {
      label: 'Not in any upsell',
      count: bcgCounts.noUpsell,
      icon: AlertCircle,
      filter: 'none' as const,
      color: 'text-gray-600',
    },
  ]

  // Item selected — show recommendation
  if (selectedItem) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-muted-foreground">Pushing:</p>
              <p className="text-lg font-semibold">
                {selectedItem.name} ({formatPrice(selectedItem.price)})
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={handleReset}>
              Change item
            </Button>
          </div>

          {isPending ? (
            <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing item...
            </div>
          ) : recommendation ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">We recommend:</p>
              <Card className="border-primary bg-primary/5">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium">
                        {PLACEMENT_LABELS[recommendation.placement]?.label}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {recommendation.reason}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-2 pt-2">
                <Button onClick={handleAccept} disabled={isPending}>
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Add to Boost Sales
                </Button>
                <Button variant="outline" onClick={handleReset}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    )
  }

  // Default state — search + tiles
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm font-medium mb-3">What do you want to sell more of?</p>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search menu items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
          {filteredItems.length > 0 && (
            <div className="absolute z-10 top-full mt-1 w-full rounded-md border bg-popover shadow-md max-h-64 overflow-y-auto">
              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  className="w-full text-left px-3 py-2 hover:bg-accent flex items-center justify-between text-sm"
                  onClick={() => handleSelectItem(item)}
                >
                  <span>{item.name}</span>
                  <span className="text-muted-foreground">{formatPrice(item.price)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tiles.map((tile) => (
            <button
              key={tile.label}
              className="rounded-lg border p-3 text-left hover:bg-accent transition-colors"
              onClick={() => {
                const items =
                  tile.filter === 'none'
                    ? menuItems.filter((i) => itemsNotInUpsell.includes(i.id))
                    : menuItems.filter((i) => i.bcg_classification === tile.filter)
                if (items.length > 0) handleSelectItem(items[0])
                else toast.info(`No ${tile.label.toLowerCase()} found`)
              }}
            >
              <tile.icon className={`h-5 w-5 ${tile.color} mb-1`} />
              <p className="text-sm font-medium">{tile.label}</p>
              <p className="text-xs text-muted-foreground">{tile.count} items</p>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
