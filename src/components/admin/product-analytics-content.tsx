'use client'

import { Fragment, useState } from 'react'
import { useProductAnalytics, usePortfolioSummary } from '@/hooks/use-convex-product-analytics'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Star,
  HelpCircle,
  Tractor,
  Dog,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'

const bcgConfig: Record<string, {
  label: string
  icon: React.ReactNode
  bgColor: string
  textColor: string
  borderColor: string
  description: string
}> = {
  star: {
    label: 'Stars',
    icon: <Star className="h-4 w-4" />,
    bgColor: 'bg-yellow-50',
    textColor: 'text-yellow-800',
    borderColor: 'border-yellow-300',
    description: 'High popularity, high profit',
  },
  puzzle: {
    label: 'Puzzles',
    icon: <HelpCircle className="h-4 w-4" />,
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-800',
    borderColor: 'border-purple-300',
    description: 'Low popularity, high profit',
  },
  plowhorse: {
    label: 'Plowhorses',
    icon: <Tractor className="h-4 w-4" />,
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-800',
    borderColor: 'border-blue-300',
    description: 'High popularity, low profit',
  },
  dog: {
    label: 'Dogs',
    icon: <Dog className="h-4 w-4" />,
    bgColor: 'bg-red-50',
    textColor: 'text-red-800',
    borderColor: 'border-red-300',
    description: 'Low popularity, low profit',
  },
}

const trendIcons: Record<string, React.ReactNode> = {
  growing: <TrendingUp className="h-4 w-4 text-green-600" />,
  declining: <TrendingDown className="h-4 w-4 text-red-600" />,
  stable: <Minus className="h-4 w-4 text-gray-500" />,
}

function MarginBadge({ margin }: { margin: number | undefined }) {
  if (margin === undefined) return <span className="text-muted-foreground">&mdash;</span>
  const color =
    margin >= 40 ? 'text-green-600' : margin >= 20 ? 'text-yellow-600' : 'text-red-600'
  return <span className={`font-medium ${color}`}>{margin.toFixed(1)}%</span>
}

export function ProductAnalyticsContent() {
  const [period, setPeriod] = useState('30d')
  const [expandedItem, setExpandedItem] = useState<string | null>(null)
  const [sortField, setSortField] = useState<string>('totalRevenue')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [isRefreshing, setIsRefreshing] = useState(false)

  const analytics = useProductAnalytics(period)
  const summary = usePortfolioSummary(period)

  const handleRefresh = () => {
    setIsRefreshing(true)
    toast.info('Refreshing analytics... this may take a moment.')
    setTimeout(() => {
      setIsRefreshing(false)
      toast.success('Analytics will refresh on the next cron cycle, or use the Convex dashboard to trigger manually.')
    }, 2000)
  }

  const sorted = analytics
    ? [...analytics].sort((a, b) => {
        const aVal = (a as Record<string, unknown>)[sortField] as number ?? 0
        const bVal = (b as Record<string, unknown>)[sortField] as number ?? 0
        return sortDir === 'desc' ? bVal - aVal : aVal - bVal
      })
    : []

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const SortHeader = ({ field, children }: { field: string; children: React.ReactNode }) => (
    <th
      className="h-10 px-3 text-left align-middle font-medium text-muted-foreground text-sm cursor-pointer select-none hover:bg-muted/50"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortField === field && (
          sortDir === 'desc' ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />
        )}
      </div>
    </th>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Product Analytics</h1>
          <p className="text-muted-foreground">
            Data-driven insights to optimize your menu profitability
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Portfolio Summary — BCG Quadrant Cards */}
      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(['star', 'puzzle', 'plowhorse', 'dog'] as const).map((cls) => {
              const config = bcgConfig[cls]
              const count = summary.counts[cls]
              return (
                <Card key={cls} className={`${config.bgColor} ${config.borderColor} border`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      {config.icon}
                      <span className={`font-semibold ${config.textColor}`}>
                        {config.label}
                      </span>
                      <span className="text-muted-foreground">({count})</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{config.description}</p>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Health summary */}
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">
              {summary.starRevenuePercent}% of revenue comes from Stars
            </span>
            {summary.lowMarginPlowhorses.length > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {summary.lowMarginPlowhorses.length} Plowhorse{summary.lowMarginPlowhorses.length > 1 ? 's' : ''} below 15% margin
              </Badge>
            )}
          </div>
        </>
      )}

      {/* Product Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Products</CardTitle>
        </CardHeader>
        <CardContent>
          {sorted.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No analytics data yet.</p>
              <p className="text-sm mt-1">
                Add cost prices to your menu items and wait for orders to flow in.
              </p>
            </div>
          ) : (
            <div className="w-full overflow-auto">
              <table className="w-full caption-bottom text-sm">
                <thead className="border-b">
                  <tr>
                    <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground text-sm">Product</th>
                    <SortHeader field="totalRevenue">Revenue</SortHeader>
                    <SortHeader field="totalUnitsSold">Units Sold</SortHeader>
                    <SortHeader field="marginPercent">Margin %</SortHeader>
                    <SortHeader field="avgDailyUnits">Avg/Day</SortHeader>
                    <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground text-sm">Trend</th>
                    <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground text-sm">Classification</th>
                    <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground text-sm"></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((item) => {
                    const bcg = bcgConfig[item.bcgClassification]
                    const isExpanded = expandedItem === item.menuItemId

                    return (
                      <Fragment key={item.menuItemId}>
                        <tr
                          className="border-b cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() =>
                            setExpandedItem(isExpanded ? null : item.menuItemId)
                          }
                        >
                          <td className="p-3 align-middle font-medium">
                            {item.menuItemId}
                          </td>
                          <td className="p-3 align-middle">
                            &#8369;{Math.round(item.totalRevenue).toLocaleString()}
                          </td>
                          <td className="p-3 align-middle">{item.totalUnitsSold}</td>
                          <td className="p-3 align-middle">
                            <MarginBadge margin={item.marginPercent} />
                          </td>
                          <td className="p-3 align-middle">{item.avgDailyUnits}</td>
                          <td className="p-3 align-middle">
                            {trendIcons[item.revenueTrend] ?? trendIcons.stable}
                          </td>
                          <td className="p-3 align-middle">
                            {bcg ? (
                              <Badge
                                variant="outline"
                                className={`${bcg.bgColor} ${bcg.textColor} ${bcg.borderColor}`}
                              >
                                {bcg.icon}
                                <span className="ml-1">{bcg.label}</span>
                              </Badge>
                            ) : (
                              <Badge variant="outline">Unclassified</Badge>
                            )}
                          </td>
                          <td className="p-3 align-middle">
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={8} className="bg-muted/30 p-4">
                              <div className="space-y-3">
                                <div className="rounded-md bg-background p-3 border">
                                  <p className="text-sm font-medium">Recommendation</p>
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {item.recommendation}
                                  </p>
                                </div>
                                {item.pairingReason && (
                                  <div className="rounded-md bg-background p-3 border">
                                    <p className="text-sm font-medium">
                                      Pairing Suggestion
                                    </p>
                                    <p className="text-sm text-muted-foreground mt-1">
                                      {item.pairingReason}
                                    </p>
                                  </div>
                                )}
                                <div className="flex gap-4 text-xs text-muted-foreground">
                                  <span>
                                    Cost: &#8369;{Math.round(item.totalCost).toLocaleString()}
                                  </span>
                                  <span>
                                    Profit: &#8369;{Math.round(item.totalProfit).toLocaleString()}
                                  </span>
                                  {item.lastOrderDate && (
                                    <span>
                                      Last order:{' '}
                                      {new Date(item.lastOrderDate).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
