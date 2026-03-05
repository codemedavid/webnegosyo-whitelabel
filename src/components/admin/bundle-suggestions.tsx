'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Sparkles, ArrowRight, TrendingUp, Lightbulb, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/cart-utils'
import type { MenuItem } from '@/types/database'

interface BundleSuggestionsProps {
  menuItems: MenuItem[]
  tenantSlug: string
  existingBundleItemIds: string[]
}

interface BundleSuggestion {
  strategy: 'margin_boost' | 'discovery' | 'complementary'
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  items: MenuItem[]
  suggestedDiscount: number
}

const BCG_BADGE_COLORS: Record<string, string> = {
  star: 'bg-yellow-100 text-yellow-800',
  plowhorse: 'bg-blue-100 text-blue-800',
  puzzle: 'bg-purple-100 text-purple-800',
  dog: 'bg-gray-100 text-gray-600',
}

function generateSuggestions(
  menuItems: MenuItem[],
  existingBundleItemIds: string[]
): BundleSuggestion[] {
  const suggestions: BundleSuggestion[] = []
  const available = menuItems.filter(
    (item) => item.is_available && !existingBundleItemIds.includes(item.id)
  )

  const stars = available.filter((i) => i.bcg_classification === 'star')
  const plowhorses = available.filter((i) => i.bcg_classification === 'plowhorse')
  const puzzles = available.filter((i) => i.bcg_classification === 'puzzle')

  if (stars.length > 0 && plowhorses.length > 0) {
    suggestions.push({
      strategy: 'margin_boost',
      label: 'Boost margin on your bestseller',
      description: 'Pair a popular high-margin item with a popular low-margin one to lift overall margin.',
      icon: TrendingUp,
      items: [stars[0], plowhorses[0]],
      suggestedDiscount: 10,
    })
  }

  if (stars.length > 0 && puzzles.length > 0) {
    suggestions.push({
      strategy: 'discovery',
      label: 'Drive discovery for hidden gems',
      description: 'Bundle your bestseller with a high-margin item that needs more exposure.',
      icon: Lightbulb,
      items: [stars[0], puzzles[0]],
      suggestedDiscount: 15,
    })
  }

  if (stars.length >= 2) {
    suggestions.push({
      strategy: 'complementary',
      label: 'Power combo — your top sellers',
      description: 'Bundle your most popular items together for an irresistible deal.',
      icon: Users,
      items: stars.slice(0, Math.min(3, stars.length)),
      suggestedDiscount: 12,
    })
  }

  return suggestions
}

export function BundleSuggestions({ menuItems, tenantSlug, existingBundleItemIds }: BundleSuggestionsProps) {
  const suggestions = useMemo(
    () => generateSuggestions(menuItems, existingBundleItemIds),
    [menuItems, existingBundleItemIds]
  )

  if (suggestions.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-yellow-500" />
          Smart Suggestions
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Bundle recommendations based on your menu performance data
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {suggestions.map((suggestion, idx) => {
            const Icon = suggestion.icon
            const itemIds = suggestion.items.map((i) => i.id).join(',')
            const totalPrice = suggestion.items.reduce((s, i) => s + i.price, 0)

            return (
              <Card key={idx} className="border-dashed">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">{suggestion.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{suggestion.description}</p>

                  <div className="space-y-1.5">
                    {suggestion.items.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 text-sm">
                        {item.image_url ? (
                          <div className="h-8 w-8 rounded overflow-hidden bg-muted flex-shrink-0 relative">
                            <Image src={item.image_url} alt={item.name} fill className="object-cover" sizes="32px" />
                          </div>
                        ) : (
                          <div className="h-8 w-8 rounded bg-muted flex-shrink-0" />
                        )}
                        <span className="truncate flex-1">{item.name}</span>
                        <Badge className={`text-xs ${BCG_BADGE_COLORS[item.bcg_classification || ''] || BCG_BADGE_COLORS.dog}`}>
                          {item.bcg_classification || 'N/A'}
                        </Badge>
                        <span className="text-muted-foreground text-xs">{formatPrice(item.price)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Suggested: {suggestion.suggestedDiscount}% discount ({formatPrice(totalPrice * (1 - suggestion.suggestedDiscount / 100))})
                  </div>

                  <Link href={`/${tenantSlug}/admin/bundles/new?suggestItems=${itemIds}&suggestDiscount=${suggestion.suggestedDiscount}`}>
                    <Button size="sm" variant="outline" className="w-full">
                      Create Bundle <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
