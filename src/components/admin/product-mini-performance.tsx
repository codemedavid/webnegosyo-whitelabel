'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useProductAnalyticsByItem } from '@/hooks/use-convex-product-analytics'

interface ProductMiniPerformanceProps {
  menuItemId: string
}

const bcgLabels: Record<string, { label: string; color: string; description: string }> = {
  star: { label: 'Star', color: 'bg-yellow-100 text-yellow-800 border-yellow-300', description: 'High popularity, high profit' },
  plowhorse: { label: 'Plowhorse', color: 'bg-blue-100 text-blue-800 border-blue-300', description: 'High popularity, low profit' },
  puzzle: { label: 'Puzzle', color: 'bg-purple-100 text-purple-800 border-purple-300', description: 'Low popularity, high profit' },
  dog: { label: 'Dog', color: 'bg-red-100 text-red-800 border-red-300', description: 'Low popularity, low profit' },
  unclassified: { label: 'Unclassified', color: 'bg-gray-100 text-gray-800 border-gray-300', description: 'Not enough data yet' },
}

const trendIcons: Record<string, React.ReactNode> = {
  growing: <TrendingUp className="h-4 w-4 text-green-600" />,
  declining: <TrendingDown className="h-4 w-4 text-red-600" />,
  stable: <Minus className="h-4 w-4 text-gray-500" />,
}

export function ProductMiniPerformance({ menuItemId }: ProductMiniPerformanceProps) {
  const analytics = useProductAnalyticsByItem(menuItemId, '30d')
  const [isExpanded, setIsExpanded] = useState(false)

  if (!analytics) return null

  const bcg = bcgLabels[analytics.bcgClassification] ?? bcgLabels.unclassified

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Performance</span>
          <Badge variant="outline" className={bcg.color}>
            {bcg.label}
          </Badge>
          {trendIcons[analytics.revenueTrend]}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
          <span className="ml-1 text-xs">
            {isExpanded ? 'Hide' : 'View Performance'}
          </span>
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-lg font-bold">{analytics.totalUnitsSold}</p>
          <p className="text-xs text-muted-foreground">Units Sold</p>
        </div>
        <div>
          <p className="text-lg font-bold">{'\u20B1'}{Math.round(analytics.totalRevenue).toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Revenue</p>
        </div>
        <div>
          <p className={`text-lg font-bold ${(analytics.marginPercent ?? 0) >= 40 ? 'text-green-600' : (analytics.marginPercent ?? 0) >= 20 ? 'text-yellow-600' : 'text-red-600'}`}>
            {analytics.marginPercent !== undefined ? `${analytics.marginPercent}%` : '\u2014'}
          </p>
          <p className="text-xs text-muted-foreground">Margin</p>
        </div>
      </div>

      {isExpanded && (
        <div className="space-y-2 border-t pt-3">
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-sm font-medium">Recommendation</p>
            <p className="text-sm text-muted-foreground mt-1">{analytics.recommendation}</p>
          </div>
          {analytics.pairingReason && (
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-sm font-medium">Pairing Suggestion</p>
              <p className="text-sm text-muted-foreground mt-1">{analytics.pairingReason}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
