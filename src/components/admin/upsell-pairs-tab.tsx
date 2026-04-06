'use client'

import { useState, useMemo, useCallback, useTransition } from 'react'
import {
  Trash2,
  Plus,
  ArrowRight,
  Search,
  ShoppingBag,
  Utensils,
  Pencil,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { deleteUpsellPairAction } from '@/app/actions/menu-engineering'
import type { MenuItemWithCategory, UpsellPairWithItems } from '@/types/database'
import { toast } from 'sonner'
import { formatPrice } from '@/lib/cart-utils'
import { UpgradePairWizard } from '@/components/admin/upgrade-pair-wizard'

export interface UpsellPairsTabProps {
  menuItems: MenuItemWithCategory[]
  upsellPairs: UpsellPairWithItems[]
  tenantId: string
  tenantSlug: string
}

export function UpsellPairsTab({
  menuItems,
  upsellPairs,
  tenantId,
  tenantSlug,
}: UpsellPairsTabProps) {
  const [isPending, startTransition] = useTransition()
  const [pairSearchQuery, setPairSearchQuery] = useState('')
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editingPair, setEditingPair] = useState<UpsellPairWithItems | null>(null)

  const handleDeletePair = useCallback(
    (pairId: string) => {
      startTransition(async () => {
        const result = await deleteUpsellPairAction(pairId, tenantId, tenantSlug)
        if (result.success) {
          toast.success('Upsell pair deleted')
        } else {
          toast.error(result.error || 'Failed to delete pair')
        }
      })
    },
    [tenantId, tenantSlug]
  )

  const handleOpenWizard = useCallback((pair?: UpsellPairWithItems) => {
    setEditingPair(pair ?? null)
    setWizardOpen(true)
  }, [])

  const handleCloseWizard = useCallback(() => {
    setWizardOpen(false)
    setEditingPair(null)
  }, [])

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setPairSearchQuery(e.target.value),
    []
  )

  const upgradePairs = useMemo(
    () => upsellPairs.filter((p) => p.pair_type === 'upgrade'),
    [upsellPairs]
  )

  const filteredPairs = useMemo(() => {
    if (!pairSearchQuery) return upgradePairs
    const q = pairSearchQuery.toLowerCase()
    return upgradePairs.filter(
      (p) =>
        p.source_item?.name.toLowerCase().includes(q) ||
        p.target_item?.name.toLowerCase().includes(q)
    )
  }, [upgradePairs, pairSearchQuery])

  // Show wizard instead of the list when open
  if (wizardOpen) {
    return (
      <UpgradePairWizard
        menuItems={menuItems}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        existingPair={editingPair}
        onClose={handleCloseWizard}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Create Button */}
      <Button onClick={() => handleOpenWizard()} className="w-full sm:w-auto">
        <Plus className="mr-2 h-4 w-4" />
        Create Upgrade Pair
      </Button>

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
                  onChange={handleSearchChange}
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
                Create your first upgrade pair to start driving more revenue per order.
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
                          {pair.source_label || 'Current'} &rarr;{' '}
                          {pair.target_label || 'Upgrade'}
                        </span>
                      )}
                      {priceDiff !== null && priceDiff > 0 && (
                        <span className="text-[10px] font-semibold text-green-600">
                          +{formatPrice(priceDiff)}
                        </span>
                      )}
                    </div>

                    {/* Edit */}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="shrink-0"
                      onClick={() => handleOpenWizard(pair)}
                      disabled={isPending}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>

                    {/* Delete with confirmation */}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive hover:text-destructive shrink-0"
                          disabled={isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete upgrade pair?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will remove the upgrade suggestion from{' '}
                            <strong>{pair.source_item?.name}</strong> to{' '}
                            <strong>{pair.target_item?.name}</strong>. Customers will no
                            longer see this upgrade prompt.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeletePair(pair.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
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
