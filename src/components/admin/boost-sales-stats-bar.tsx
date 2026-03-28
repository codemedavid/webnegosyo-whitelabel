'use client'

import { useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { TrendingUp, Target, DollarSign, Zap } from 'lucide-react'
import type { MenuItem, UpsellPairWithItems } from '@/types/database'
import type { BundleWithSlots } from '@/lib/bundles-service'

interface BoostSalesStatsBarProps {
  menuItems: MenuItem[]
  upsellPairs: UpsellPairWithItems[]
  bundles: BundleWithSlots[]
}

export function BoostSalesStatsBar({ menuItems, upsellPairs, bundles }: BoostSalesStatsBarProps) {
  const stats = useMemo(() => {
    const activePairs = upsellPairs.filter(p => p.is_active).length
    const activeBundles = bundles.filter(b => b.is_active).length
    const checkoutPicks = menuItems.filter(i => i.show_in_checkout_upsell).length
    const totalActive = activePairs + activeBundles + checkoutPicks

    const itemsInUpsell = new Set<string>()
    for (const pair of upsellPairs) {
      if (pair.is_active) {
        itemsInUpsell.add(pair.source_item_id)
        itemsInUpsell.add(pair.target_item_id)
      }
    }
    for (const item of menuItems) {
      if (item.show_in_checkout_upsell) itemsInUpsell.add(item.id)
    }
    const coveragePercent = menuItems.length > 0
      ? Math.round((itemsInUpsell.size / menuItems.length) * 100)
      : 0

    return { totalActive, activePairs, activeBundles, checkoutPicks, coveragePercent }
  }, [menuItems, upsellPairs, bundles])

  const cards = [
    {
      label: 'Active Upsells',
      value: stats.totalActive,
      detail: `${stats.activePairs} pairs, ${stats.activeBundles} combos, ${stats.checkoutPicks} checkout`,
      icon: Zap,
    },
    {
      label: 'Menu Coverage',
      value: `${stats.coveragePercent}%`,
      detail: 'of items are in at least one upsell',
      icon: Target,
    },
    {
      label: 'Acceptance Rate',
      value: '—',
      detail: 'Connect analytics to see live data',
      icon: TrendingUp,
    },
    {
      label: 'Extra Revenue',
      value: '—',
      detail: 'Connect analytics to see live data',
      icon: DollarSign,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <card.icon className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
            </div>
            <p className="mt-2 text-2xl font-bold">{card.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{card.detail}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
