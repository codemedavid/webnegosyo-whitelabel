'use client'

import { useState, useMemo, useTransition } from 'react'
import {
  Trash2,
  Plus,
  ArrowRight,
  ArrowUpRight,
  Search,
  ShoppingBag,
  Zap,
  Utensils,
  Eye,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  createUpsellPairAction,
  deleteUpsellPairAction,
} from '@/app/actions/menu-engineering'
import type { MenuItem, UpsellPairWithItems } from '@/types/database'
import { toast } from 'sonner'
import { formatPrice } from '@/lib/cart-utils'
import { SmartUpgradePanel } from '@/components/admin/smart-upgrade-panel'

interface MenuItemWithCategory extends MenuItem {
  category: { id: string; name: string } | null
}

export interface UpsellPairsTabProps {
  menuItems: MenuItemWithCategory[]
  upsellPairs: UpsellPairWithItems[]
  tenantId: string
  tenantSlug: string
}

function UpgradePreview({
  sourceItem,
  targetItem,
  upgradeHeader,
  sourceLabel,
  targetLabel,
}: {
  sourceItem: MenuItem | undefined
  targetItem: MenuItem | undefined
  upgradeHeader: string
  sourceLabel: string
  targetLabel: string
}) {
  if (!sourceItem || !targetItem) return null

  const priceDiff = targetItem.price - sourceItem.price

  return (
    <div className="mt-4 rounded-xl border-2 border-dashed border-primary/20 bg-gradient-to-b from-primary/5 to-transparent p-4">
      <div className="mb-3 flex items-center gap-2">
        <Eye className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Customer preview
        </span>
      </div>

      {/* Simulated modal header */}
      <div className="rounded-lg border bg-background p-4 shadow-sm">
        <p className="mb-3 text-center text-sm font-semibold">
          {upgradeHeader || `Upgrade your ${sourceItem.name}?`}
        </p>

        <div className="grid grid-cols-2 gap-3">
          {/* Source card */}
          <div className="rounded-lg border-2 border-muted p-3 text-center">
            <div className="mx-auto mb-2 h-16 w-16 overflow-hidden rounded-lg bg-muted">
              {sourceItem.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={sourceItem.image_url}
                  alt={sourceItem.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <ShoppingBag className="h-6 w-6 text-muted-foreground/40" />
                </div>
              )}
            </div>
            <Badge variant="secondary" className="mb-1 text-[10px]">
              {sourceLabel || 'Current'}
            </Badge>
            <p className="text-xs font-medium truncate">{sourceItem.name}</p>
            <p className="text-xs text-muted-foreground">{formatPrice(sourceItem.price)}</p>
          </div>

          {/* Target card */}
          <div className="rounded-lg border-2 border-primary p-3 text-center ring-1 ring-primary/20">
            <div className="mx-auto mb-2 h-16 w-16 overflow-hidden rounded-lg bg-muted">
              {targetItem.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={targetItem.image_url}
                  alt={targetItem.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <ShoppingBag className="h-6 w-6 text-muted-foreground/40" />
                </div>
              )}
            </div>
            <Badge className="mb-1 text-[10px]">
              {targetLabel || 'Upgrade'}
            </Badge>
            <p className="text-xs font-medium truncate">{targetItem.name}</p>
            <p className="text-xs text-muted-foreground">{formatPrice(targetItem.price)}</p>
            {priceDiff > 0 && (
              <p className="mt-0.5 text-[10px] font-semibold text-green-600">
                +{formatPrice(priceDiff)}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function UpsellPairsTab({
  menuItems,
  upsellPairs,
  tenantId,
  tenantSlug,
}: UpsellPairsTabProps) {
  const [isPending, startTransition] = useTransition()
  const [sourceItemId, setSourceItemId] = useState('')
  const [targetItemId, setTargetItemId] = useState('')
  const pairType = 'upgrade' as const
  const [upgradeHeader, setUpgradeHeader] = useState('')
  const [sourceLabel, setSourceLabel] = useState('')
  const [targetLabel, setTargetLabel] = useState('')
  const [pairSearchQuery, setPairSearchQuery] = useState('')

  const handleCreatePair = () => {
    if (!sourceItemId || !targetItemId) {
      toast.error('Select both source and target items')
      return
    }
    if (sourceItemId === targetItemId) {
      toast.error('Source and target must be different items')
      return
    }

    startTransition(async () => {
      const result = await createUpsellPairAction(tenantId, tenantSlug, {
        source_item_id: sourceItemId,
        target_item_id: targetItemId,
        pair_type: pairType,
        ...(pairType === 'upgrade' ? {
          upgrade_header: upgradeHeader || undefined,
          source_label: sourceLabel || undefined,
          target_label: targetLabel || undefined,
        } : {}),
      })
      if (result.success) {
        toast.success('Upsell pair created')
        setSourceItemId('')
        setTargetItemId('')
        setUpgradeHeader('')
        setSourceLabel('')
        setTargetLabel('')
      } else {
        toast.error(result.error || 'Failed to create pair')
      }
    })
  }

  const handleDeletePair = (pairId: string) => {
    startTransition(async () => {
      const result = await deleteUpsellPairAction(pairId, tenantId, tenantSlug)
      if (result.success) {
        toast.success('Upsell pair deleted')
      } else {
        toast.error(result.error || 'Failed to delete pair')
      }
    })
  }

  const availableItems = menuItems.filter((item) => item.is_available)

  const sourceItem = availableItems.find((item) => item.id === sourceItemId)
  const targetItem = availableItems.find((item) => item.id === targetItemId)

  const upgradePairs = useMemo(() => upsellPairs.filter((p) => p.pair_type === 'upgrade'), [upsellPairs])

  const filteredPairs = useMemo(() => {
    let pairs = upgradePairs
    if (pairSearchQuery) {
      const q = pairSearchQuery.toLowerCase()
      pairs = pairs.filter(
        (p) =>
          p.source_item?.name.toLowerCase().includes(q) ||
          p.target_item?.name.toLowerCase().includes(q)
      )
    }
    return pairs
  }, [upgradePairs, pairSearchQuery])

  return (
    <div className="space-y-6">
      {/* Add Pair Form */}
      <Card>
        <CardHeader>
          <CardTitle>Create Upsell Pair</CardTitle>
          <CardDescription>
            Set up item-to-item relationships that drive revenue through smart suggestions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Pair type indicator */}
          <div className="flex items-start gap-3 rounded-xl border-2 border-primary bg-primary/5 p-4">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ArrowUpRight className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Upgrade Pair</p>
              <p className="text-xs text-muted-foreground">
                &quot;Make it a meal?&quot; -- Side-by-side comparison that drives higher-value orders
              </p>
            </div>
          </div>

          {/* Item selectors */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[200px] flex-1 space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">
                When customer orders this...
              </Label>
              <Select value={sourceItemId} onValueChange={setSourceItemId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select source item" />
                </SelectTrigger>
                <SelectContent>
                  {availableItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} ({formatPrice(item.price)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <ArrowRight className="mb-2 h-5 w-5 text-muted-foreground hidden sm:block" />

            <div className="min-w-[200px] flex-1 space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">
                Suggest upgrading to...
              </Label>
              <Select value={targetItemId} onValueChange={setTargetItemId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target item" />
                </SelectTrigger>
                <SelectContent>
                  {availableItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} ({formatPrice(item.price)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handleCreatePair} disabled={isPending} className="shrink-0">
              <Plus className="mr-2 h-4 w-4" />
              Add Pair
            </Button>
          </div>

          {/* Price difference callout for upgrades */}
          {pairType === 'upgrade' && sourceItem && targetItem && (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-2.5 dark:bg-green-950/30">
              <Zap className="h-4 w-4 text-green-600 shrink-0" />
              <span className="text-sm text-green-700 dark:text-green-400">
                {targetItem.price > sourceItem.price
                  ? `Upgrade value: +${formatPrice(targetItem.price - sourceItem.price)} per order`
                  : targetItem.price === sourceItem.price
                    ? 'Same price -- consider choosing a higher-priced target'
                    : 'Target is cheaper than source -- are you sure?'}
              </span>
            </div>
          )}

          {/* Upgrade-specific labels */}
          {pairType === 'upgrade' && (
            <div className="space-y-4 rounded-lg border border-dashed p-4">
              <p className="text-sm font-medium text-muted-foreground">
                Customize the upgrade comparison labels (optional)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="upgrade-header">Header Text</Label>
                  <Input
                    id="upgrade-header"
                    placeholder="e.g. Want to make it a meal?"
                    value={upgradeHeader}
                    onChange={(e) => setUpgradeHeader(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Default: &quot;Upgrade your [item]?&quot;
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="source-label">Current Item Label</Label>
                  <Input
                    id="source-label"
                    placeholder="e.g. A la carte"
                    value={sourceLabel}
                    onChange={(e) => setSourceLabel(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Default: &quot;Current&quot;
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="target-label">Upgrade Item Label</Label>
                  <Input
                    id="target-label"
                    placeholder="e.g. Meal"
                    value={targetLabel}
                    onChange={(e) => setTargetLabel(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Default: &quot;Upgrade&quot;
                  </p>
                </div>
              </div>

              {/* Live preview */}
              <UpgradePreview
                sourceItem={sourceItem}
                targetItem={targetItem}
                upgradeHeader={upgradeHeader}
                sourceLabel={sourceLabel}
                targetLabel={targetLabel}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Smart Upgrade Suggestions */}
      <SmartUpgradePanel
        selectedItemId={sourceItemId || null}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        menuItems={menuItems}
      />

      {/* Existing Pairs */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Existing Upgrade Pairs</CardTitle>
              <CardDescription className="mt-1">
                {upgradePairs.length} upgrade pair{upgradePairs.length !== 1 ? 's' : ''}
              </CardDescription>
            </div>

            {upgradePairs.length > 0 && (
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search pairs..."
                  value={pairSearchQuery}
                  onChange={(e) => setPairSearchQuery(e.target.value)}
                  className="h-8 w-48 pl-8 text-xs"
                />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {upgradePairs.length === 0 ? (
            <div className="py-12 text-center">
              <Utensils className="mx-auto h-10 w-10 text-muted-foreground/30" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">
                No upgrade pairs configured yet
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Create your first upgrade pair above to start driving more revenue per order.
              </p>
            </div>
          ) : filteredPairs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No pairs match your filter.
            </p>
          ) : (
            <div className="space-y-2">
              {filteredPairs.map((pair) => {
                const priceDiff =
                  pair.source_item && pair.target_item
                    ? pair.target_item.price - pair.source_item.price
                    : null

                return (
                  <div
                    key={pair.id}
                    className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/[0.02] p-3 transition-colors"
                  >
                    {/* Source Item */}
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                        {pair.source_item?.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={pair.source_item.image_url}
                            alt={pair.source_item.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <ShoppingBag className="h-4 w-4 text-muted-foreground/40" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {pair.source_item?.name || 'Unknown'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {pair.source_item ? formatPrice(pair.source_item.price) : ''}
                        </p>
                      </div>
                    </div>

                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />

                    {/* Target Item */}
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                        {pair.target_item?.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={pair.target_item.image_url}
                            alt={pair.target_item.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <ShoppingBag className="h-4 w-4 text-muted-foreground/40" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {pair.target_item?.name || 'Unknown'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {pair.target_item ? formatPrice(pair.target_item.price) : ''}
                        </p>
                      </div>
                    </div>

                    {/* Labels + Price Diff */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge variant="default">upgrade</Badge>
                      {(pair.source_label || pair.target_label) && (
                        <span className="text-[10px] text-muted-foreground">
                          {pair.source_label || 'Current'} &rarr; {pair.target_label || 'Upgrade'}
                        </span>
                      )}
                      {priceDiff !== null && priceDiff > 0 && (
                        <span className="text-[10px] font-semibold text-green-600">
                          +{formatPrice(priceDiff)}
                        </span>
                      )}
                    </div>

                    {/* Delete */}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive shrink-0"
                      onClick={() => handleDeletePair(pair.id)}
                      disabled={isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
