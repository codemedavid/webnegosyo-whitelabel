'use client'

import { useMemo, useState } from 'react'
import { useProductAnalytics, usePortfolioSummary, useRefreshAnalytics } from '@/hooks/use-convex-product-analytics'
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
  X,
  Lightbulb,
  Link2,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export interface ProductMenuItem {
  id: string
  name: string
  isAvailable?: boolean
}

interface ProductRow {
  menuItemId: string
  menuItemName?: string
  totalUnitsSold: number
  totalRevenue: number
  totalCost: number
  totalProfit: number
  marginPercent?: number
  avgDailyUnits: number
  revenueTrend: string
  bcgClassification: string
  recommendation: string
  pairingReason?: string
  lastOrderDate?: number
  isAvailable?: boolean
  hasData?: boolean
}

interface ProductAnalyticsContentProps {
  menuItems: ProductMenuItem[]
  menuEngineeringEnabled: boolean
}

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

const trendLabels: Record<string, string> = {
  growing: 'Growing',
  declining: 'Declining',
  stable: 'Stable',
}

function MarginBadge({ margin }: { margin: number | undefined }) {
  if (margin === undefined) return <span className="text-muted-foreground">&mdash;</span>
  const color =
    margin >= 40 ? 'text-green-600' : margin >= 20 ? 'text-yellow-600' : 'text-red-600'
  return <span className={`font-medium ${color}`}>{margin.toFixed(1)}%</span>
}

function peso(n: number) {
  return `₱${Math.round(n).toLocaleString()}`
}

function zeroRow(id: string, name: string, isAvailable?: boolean): ProductRow {
  return {
    menuItemId: id,
    menuItemName: name,
    totalUnitsSold: 0,
    totalRevenue: 0,
    totalCost: 0,
    totalProfit: 0,
    marginPercent: undefined,
    avgDailyUnits: 0,
    revenueTrend: 'stable',
    bcgClassification: 'unclassified',
    recommendation: 'No sales in this period yet. Add a cost price and wait for orders to unlock insights.',
    isAvailable,
    hasData: false,
  }
}

export function ProductAnalyticsContent({ menuItems, menuEngineeringEnabled }: ProductAnalyticsContentProps) {
  const [period, setPeriod] = useState('30d')
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [filterClass, setFilterClass] = useState<string | null>(null)
  const [sortField, setSortField] = useState<string>('totalRevenue')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [isRefreshing, setIsRefreshing] = useState(false)

  const analytics = useProductAnalytics(period) as ProductRow[] | undefined
  const summary = usePortfolioSummary(period)
  const refreshAnalytics = useRefreshAnalytics()

  const handleRefresh = async () => {
    setIsRefreshing(true)
    toast.info('Computing analytics... this may take a moment.')
    try {
      await refreshAnalytics()
      toast.success('Analytics refreshed successfully.')
    } catch {
      toast.error('Failed to refresh analytics.')
    } finally {
      setIsRefreshing(false)
    }
  }

  // Menu-first: every available product appears, even with zero sales. Analytics
  // rows are overlaid by id; rows for items no longer on the menu are appended so
  // historical revenue is never lost.
  const rows: ProductRow[] = useMemo(() => {
    const byId = new Map<string, ProductRow>()
    for (const a of analytics ?? []) byId.set(a.menuItemId, { ...a, hasData: true })

    const seen = new Set<string>()
    const out: ProductRow[] = []
    for (const mi of menuItems) {
      seen.add(mi.id)
      const a = byId.get(mi.id)
      out.push(
        a
          ? { ...a, menuItemName: a.menuItemName ?? mi.name, isAvailable: mi.isAvailable }
          : zeroRow(mi.id, mi.name, mi.isAvailable)
      )
    }
    for (const a of analytics ?? []) {
      if (!seen.has(a.menuItemId)) out.push({ ...a, hasData: true })
    }
    return out
  }, [menuItems, analytics])

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const aVal = Number((a as Record<string, unknown>)[sortField]) || 0
        const bVal = Number((b as Record<string, unknown>)[sortField]) || 0
        return sortDir === 'desc' ? bVal - aVal : aVal - bVal
      }),
    [rows, sortField, sortDir]
  )

  const filtered = filterClass
    ? sorted.filter(item => item.bcgClassification === filterClass)
    : sorted

  const selectedItem = sorted.find(i => i.menuItemId === selectedItemId) ?? null

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

  const bcgForSelected = selectedItem ? bcgConfig[selectedItem.bcgClassification] : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Product Analytics</h1>
          <p className="text-muted-foreground">
            {menuEngineeringEnabled
              ? 'Data-driven insights to optimize your menu profitability'
              : 'Sales performance for every product on your menu'}
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

      {/* Portfolio Summary — BCG Quadrant Cards (advanced; gated) */}
      {menuEngineeringEnabled && summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(['star', 'puzzle', 'plowhorse', 'dog'] as const).map((cls) => {
              const config = bcgConfig[cls]
              const count = summary.counts[cls]
              const isActive = filterClass === cls
              return (
                <Card
                  key={cls}
                  className={cn(
                    `${config.bgColor} ${config.borderColor} border cursor-pointer transition-all`,
                    isActive ? 'ring-2 ring-offset-1 ring-current shadow-md scale-[1.02]' : 'hover:shadow-sm'
                  )}
                  onClick={() => setFilterClass(isActive ? null : cls)}
                >
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

          {/* Health summary or setup guidance */}
          {(() => {
            const totalClassified = summary.counts.star + summary.counts.puzzle + summary.counts.plowhorse + summary.counts.dog
            const productsWithMargin = (analytics ?? []).filter((a) => a.marginPercent !== undefined).length
            const productsWithEnoughOrders = (analytics ?? []).filter((a) => a.totalUnitsSold >= 5).length

            if (totalClassified === 0) {
              const needs: string[] = []
              if (productsWithMargin < 2) {
                needs.push(`Add cost prices to at least ${2 - productsWithMargin} more product${productsWithMargin === 1 ? '' : 's'}`)
              }
              if (productsWithEnoughOrders < 2) {
                needs.push(`Need ${2 - productsWithEnoughOrders} more product${productsWithEnoughOrders === 1 ? '' : 's'} with 5+ orders`)
              }
              return (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-amber-900">Classification not yet available</p>
                      <p className="mt-1 text-amber-800">
                        Products need both a cost price and at least 5 orders to be classified.
                        At least 2 qualifying products are required to calculate thresholds.
                      </p>
                      {needs.length > 0 && (
                        <ul className="mt-2 list-disc pl-4 space-y-0.5 text-amber-800">
                          {needs.map((need, i) => <li key={i}>{need}</li>)}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              )
            }

            const totalRev = sorted.reduce((s, i) => s + i.totalRevenue, 0)
            const classRevenue = (['star', 'puzzle', 'plowhorse', 'dog'] as const).map((cls) => {
              const rev = sorted.filter(i => i.bcgClassification === cls).reduce((s, i) => s + i.totalRevenue, 0)
              const pct = totalRev > 0 ? Math.round((rev / totalRev) * 1000) / 10 : 0
              return { cls, rev, pct }
            })

            const visibleRevenue = filterClass
              ? classRevenue.filter(r => r.cls === filterClass)
              : classRevenue

            return (
              <div className="space-y-2">
                <div className={cn(
                  'grid gap-3 text-sm',
                  visibleRevenue.length === 1 ? 'grid-cols-1' : 'grid-cols-2 md:grid-cols-4'
                )}>
                  {visibleRevenue.map(({ cls, rev, pct }) => {
                    const config = bcgConfig[cls]
                    return (
                      <div key={cls} className="flex items-center gap-2 rounded-md border px-3 py-2">
                        <span className={`text-lg font-bold ${config.textColor}`}>{pct}%</span>
                        <div className="text-xs text-muted-foreground leading-tight">
                          <div>from {config.label}</div>
                          <div>{peso(rev)}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {summary.lowMarginPlowhorses.length > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {summary.lowMarginPlowhorses.length} Plowhorse{summary.lowMarginPlowhorses.length > 1 ? 's' : ''} below 15% margin
                  </Badge>
                )}
              </div>
            )
          })()}
        </>
      )}

      {/* Product Table + Detail Panel */}
      <div className="flex gap-4">
        {/* Table */}
        <Card className={cn('transition-all min-w-0', selectedItem ? 'flex-[3]' : 'w-full')}>
          <CardHeader>
            <CardTitle>
              {filterClass ? bcgConfig[filterClass]?.label ?? 'Products' : 'All Products'}
              <span className="ml-2 text-sm font-normal text-muted-foreground">({filtered.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>{filterClass ? `No ${bcgConfig[filterClass]?.label ?? ''} products.` : 'No products on the menu yet.'}</p>
              </div>
            ) : (
              <div className="w-full overflow-auto">
                <table className="w-full caption-bottom text-sm">
                  <thead className="border-b">
                    <tr>
                      <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground text-sm">Product</th>
                      <SortHeader field="totalRevenue">Revenue</SortHeader>
                      <SortHeader field="totalUnitsSold">Units</SortHeader>
                      {menuEngineeringEnabled && <SortHeader field="marginPercent">Margin</SortHeader>}
                      {!selectedItem && <SortHeader field="avgDailyUnits">Avg/Day</SortHeader>}
                      {!selectedItem && !menuEngineeringEnabled && (
                        <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground text-sm">Last Order</th>
                      )}
                      {!selectedItem && menuEngineeringEnabled && (
                        <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground text-sm">Trend</th>
                      )}
                      {menuEngineeringEnabled && (
                        <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground text-sm">Class</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((item) => {
                      const bcg = bcgConfig[item.bcgClassification]
                      const isSelected = selectedItemId === item.menuItemId

                      return (
                        <tr
                          key={item.menuItemId}
                          className={cn(
                            'border-b cursor-pointer transition-colors',
                            isSelected ? 'bg-muted' : 'hover:bg-muted/50',
                            !item.hasData && 'text-muted-foreground'
                          )}
                          onClick={() => setSelectedItemId(isSelected ? null : item.menuItemId)}
                        >
                          <td className="p-3 align-middle font-medium text-foreground">
                            <span className="flex items-center gap-2">
                              {item.menuItemName ?? item.menuItemId}
                              {item.isAvailable === false && (
                                <Badge variant="outline" className="text-xs">Hidden</Badge>
                              )}
                            </span>
                          </td>
                          <td className="p-3 align-middle">{peso(item.totalRevenue)}</td>
                          <td className="p-3 align-middle">{item.totalUnitsSold}</td>
                          {menuEngineeringEnabled && (
                            <td className="p-3 align-middle">
                              <MarginBadge margin={item.marginPercent} />
                            </td>
                          )}
                          {!selectedItem && <td className="p-3 align-middle">{item.avgDailyUnits}</td>}
                          {!selectedItem && !menuEngineeringEnabled && (
                            <td className="p-3 align-middle">
                              {item.lastOrderDate ? new Date(item.lastOrderDate).toLocaleDateString() : '—'}
                            </td>
                          )}
                          {!selectedItem && menuEngineeringEnabled && (
                            <td className="p-3 align-middle">
                              {trendIcons[item.revenueTrend] ?? trendIcons.stable}
                            </td>
                          )}
                          {menuEngineeringEnabled && (
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
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Detail Panel */}
        {selectedItem && (
          <Card className="flex-[2] min-w-[320px] max-w-[480px] shrink-0 self-start sticky top-4">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-lg">
                    {selectedItem.menuItemName ?? selectedItem.menuItemId}
                  </CardTitle>
                  {menuEngineeringEnabled && (
                    bcgForSelected ? (
                      <Badge
                        variant="outline"
                        className={`${bcgForSelected.bgColor} ${bcgForSelected.textColor} ${bcgForSelected.borderColor}`}
                      >
                        {bcgForSelected.icon}
                        <span className="ml-1">{bcgForSelected.label}</span>
                      </Badge>
                    ) : (
                      <Badge variant="outline">Unclassified</Badge>
                    )
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setSelectedItemId(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Key metrics grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">Revenue</p>
                  <p className="text-lg font-bold">{peso(selectedItem.totalRevenue)}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">Units Sold</p>
                  <p className="text-lg font-bold">{selectedItem.totalUnitsSold}</p>
                </div>
                {menuEngineeringEnabled && (
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Margin</p>
                    <p className="text-lg font-bold">
                      <MarginBadge margin={selectedItem.marginPercent} />
                    </p>
                  </div>
                )}
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">Avg/Day</p>
                  <div className="flex items-center gap-1.5">
                    <p className="text-lg font-bold">{selectedItem.avgDailyUnits}</p>
                    {menuEngineeringEnabled && (trendIcons[selectedItem.revenueTrend] ?? trendIcons.stable)}
                  </div>
                </div>
              </div>

              {/* Cost & Profit (advanced; gated) */}
              {menuEngineeringEnabled && (
                <div className="rounded-lg border p-3 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Cost</span>
                    <span className="font-medium">
                      {selectedItem.totalCost > 0 ? peso(selectedItem.totalCost) : 'No cost set'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Profit</span>
                    <span className={cn('font-medium', selectedItem.totalProfit > 0 ? 'text-green-600' : '')}>
                      {selectedItem.totalCost > 0 ? peso(selectedItem.totalProfit) : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Trend</span>
                    <span className="flex items-center gap-1">
                      {trendIcons[selectedItem.revenueTrend] ?? trendIcons.stable}
                      <span className="text-sm">{trendLabels[selectedItem.revenueTrend] ?? 'Stable'}</span>
                    </span>
                  </div>
                  {selectedItem.lastOrderDate && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Last Order</span>
                      <span>{new Date(selectedItem.lastOrderDate).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Basic last-order line when advanced features are off */}
              {!menuEngineeringEnabled && (
                <div className="rounded-lg border p-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Last Order</span>
                    <span>{selectedItem.lastOrderDate ? new Date(selectedItem.lastOrderDate).toLocaleDateString() : 'No sales yet'}</span>
                  </div>
                </div>
              )}

              {/* Recommendation (advanced; gated) */}
              {menuEngineeringEnabled && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Lightbulb className="h-4 w-4 text-blue-600" />
                    <p className="text-sm font-semibold text-blue-900">Recommendation</p>
                  </div>
                  <p className="text-sm text-blue-800">{selectedItem.recommendation}</p>
                </div>
              )}

              {/* Cross-Promotion (advanced; gated) */}
              {menuEngineeringEnabled && selectedItem.pairingReason && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Link2 className="h-4 w-4 text-emerald-600" />
                    <p className="text-sm font-semibold text-emerald-900">Cross-Promotion</p>
                  </div>
                  <p className="text-sm text-emerald-800">{selectedItem.pairingReason}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
