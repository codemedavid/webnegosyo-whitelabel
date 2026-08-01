'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { RotateCcw, Store } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  saveOutletMenuOverrideAction,
  clearOutletMenuOverrideAction,
} from '@/app/actions/outlet-menu'
import {
  buildOutletMenuIndex,
  describeBranchSummary,
  findOutletMenuOverride,
  resolveItemForOutlet,
  summarizeItemAcrossBranches,
  type OutletMenuOverrideRow,
} from '@/lib/outlets/outlet-menu-overrides'
import type { MenuItem, OutletMenuOverride } from '@/types/database'

interface ItemBranchesPanelProps {
  tenantId: string
  tenantSlug: string
  item: MenuItem
  outlets: readonly { id: string; name: string }[]
  initialOverrides: readonly OutletMenuOverride[]
}

/**
 * One dish, across every branch — the other way into the same data the branch's
 * Menu tab edits.
 *
 * Both views exist because merchants arrive from both directions: from a dish
 * ("who sells this, and for how much"), and from a shop ("what do we sell
 * here"). Neither is a subset of the other, and forcing one intent through the
 * other's screen is what makes multi-branch admin tedious.
 *
 * Every branch gets a row whether or not it has an override, so "same as the
 * rest of the store" is a visible state rather than an absence.
 */
export function ItemBranchesPanel({
  tenantId,
  tenantSlug,
  item,
  outlets,
  initialOverrides,
}: ItemBranchesPanelProps) {
  const [overrides, setOverrides] = useState<OutletMenuOverride[]>([...initialOverrides])
  const [savingId, setSavingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const index = useMemo(
    () => buildOutletMenuIndex(overrides as unknown as OutletMenuOverrideRow[]),
    [overrides]
  )

  const summaryLabel = useMemo(
    () => describeBranchSummary(summarizeItemAcrossBranches(item, outlets, index)),
    [item, outlets, index]
  )

  if (outlets.length === 0) return null

  const applyPatch = (
    outletId: string,
    patch: Parameters<typeof saveOutletMenuOverrideAction>[4]
  ) => {
    setSavingId(outletId)
    startTransition(async () => {
      const result = await saveOutletMenuOverrideAction(
        tenantId,
        tenantSlug,
        outletId,
        item.id,
        patch
      )
      setSavingId(null)

      if (!result.success) {
        toast.error(result.error)
        return
      }

      setOverrides((prev) => {
        const rest = prev.filter((row) => row.outlet_id !== outletId)
        return result.data ? [...rest, result.data] : rest
      })
    })
  }

  const reset = (outletId: string) => {
    setSavingId(outletId)
    startTransition(async () => {
      const result = await clearOutletMenuOverrideAction(tenantId, tenantSlug, outletId, item.id)
      setSavingId(null)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setOverrides((prev) => prev.filter((row) => row.outlet_id !== outletId))
    })
  }

  const parsePrice = (raw: string): number | null => {
    const trimmed = raw.trim()
    if (trimmed === '') return null
    const value = Number(trimmed)
    return Number.isFinite(value) ? value : null
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Store className="h-4 w-4" />
            Branches
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Blank price means this branch charges the store price.
          </p>
        </div>
        {summaryLabel && (
          <Badge
            variant={summaryLabel.tone === 'warning' ? 'destructive' : 'secondary'}
            title={summaryLabel.detail}
          >
            {summaryLabel.text}
          </Badge>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {outlets.map((outlet) => {
          const override = findOutletMenuOverride(index, outlet.id, item.id)
          const resolved = resolveItemForOutlet(item, override)
          const isBusy = savingId === outlet.id

          return (
            <div
              key={outlet.id}
              className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">{outlet.name}</p>
                <p className="text-xs text-muted-foreground">
                  {override === null ? 'Same as the rest of the store' : 'Set for this branch'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={override?.is_listed ?? true}
                    disabled={isBusy}
                    onCheckedChange={(checked) => applyPatch(outlet.id, { is_listed: checked })}
                    aria-label={`On the menu at ${outlet.name}`}
                  />
                  On the menu
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={resolved.is_available !== false}
                    disabled={isBusy || item.is_available === false}
                    onCheckedChange={(checked) => applyPatch(outlet.id, { is_available: checked })}
                    aria-label={`In stock at ${outlet.name}`}
                  />
                  In stock
                </label>

                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  disabled={isBusy}
                  defaultValue={override?.price ?? ''}
                  placeholder={String(item.price)}
                  className="w-28"
                  aria-label={`Price at ${outlet.name}`}
                  onBlur={(e) => {
                    const next = parsePrice(e.target.value)
                    if (next === (override?.price ?? null)) return
                    applyPatch(outlet.id, { price: next })
                  }}
                />

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isBusy || override === null}
                  onClick={() => reset(outlet.id)}
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  Reset
                </Button>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
