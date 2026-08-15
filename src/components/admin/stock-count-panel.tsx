'use client'

/**
 * Starting and finishing a stock count.
 *
 * The two buttons are the small part. The panel's real job is to say, at the
 * one moment the merchant can still change the outcome, how much of the shelf
 * nobody has looked at — because once the count closes, the report can only
 * describe what happened.
 *
 * All the wording lives in `count-panel.ts` so the merchant app can grow the
 * same panel without the two surfaces drifting apart.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardList, Loader2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { describeCountPanel } from '@/lib/inventory/count-panel'
import {
  movementOutletLabel,
  resolveDefaultMovementOutlet,
  STORE_POOL_LABEL,
  type SelectableBranch,
} from '@/lib/inventory/stock-outlet'
import type { CountSessionProgress } from '@/lib/inventory/count-session'
import {
  openStockCountAction,
  closeStockCountAction,
} from '@/app/actions/inventory-counts'

interface StockCountPanelProps {
  tenantId: string
  tenantSlug: string
  /** The shelf being counted. `null` is the unbranched store pool, a real place. */
  outletId: string | null
  /** The running count's id, or `null` when none is. */
  countId: string | null
  /** How far the running count has got, or `null` when none is running. */
  progress: CountSessionProgress | null
  /**
   * Branches a store-wide admin may count. Empty for a single-shop store —
   * the selector then never renders and the store pool is the only shelf.
   */
  branches?: readonly SelectableBranch[]
}

export function StockCountPanel({
  tenantId,
  tenantSlug,
  outletId,
  countId,
  progress,
  branches = [],
}: StockCountPanelProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  /**
   * Which shelf the NEXT count opens on. Seeded from the running count's
   * shelf when one is, otherwise the same default the stock dialog uses.
   */
  const [selectedOutletId, setSelectedOutletId] = useState<string | null>(
    countId !== null ? outletId : (outletId ?? resolveDefaultMovementOutlet(branches)),
  )

  const copy = describeCountPanel(progress)
  const isCounting = countId !== null

  /**
   * A refusal is shown, never swallowed. A silent failure is the worst outcome
   * on this panel: the merchant counts the whole shop believing it is being
   * recorded, and only the report weeks later says otherwise.
   */
  const run = (action: () => Promise<{ success: boolean; error?: string }>) => {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (!result.success) {
        setError(result.error ?? 'Something went wrong')
        return
      }
      // Refresh so the merchant's next entry lands in the count they just
      // started — without it the page still believes none is running and every
      // stocktake is filed as a one-off.
      router.refresh()
    })
  }

  const handleClick = () => {
    if (copy.isCounting && countId) {
      run(() => closeStockCountAction(tenantId, tenantSlug, countId))
      return
    }
    run(() => openStockCountAction(tenantId, tenantSlug, { outletId: selectedOutletId }))
  }

  // The shelf must be named whenever there is more than one it could be:
  // "Counting…" alone reads as the whole store, and a count is a statement
  // about exactly one shelf.
  const shelfLabel = isCounting ? movementOutletLabel(outletId, branches) : null

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <ClipboardList className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">Stock count</h3>
              {branches.length > 0 && shelfLabel && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                  {shelfLabel}
                </span>
              )}
              {copy.progressLabel && (
                <span
                  data-testid="stock-count-progress"
                  className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium"
                >
                  {copy.progressLabel}
                </span>
              )}
            </div>
            <p data-testid="stock-count-detail" className="text-sm text-muted-foreground">
              {copy.detail}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Which shelf the count is about — chosen before it starts, fixed
              once it has. */}
          {!isCounting && branches.length > 0 && (
            <Select
              value={selectedOutletId ?? 'store-pool'}
              onValueChange={(value) =>
                setSelectedOutletId(value === 'store-pool' ? null : value)
              }
            >
              <SelectTrigger className="w-40" aria-label="Shelf to count">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="store-pool">{STORE_POOL_LABEL}</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={handleClick} disabled={isPending} variant={copy.isCounting ? 'default' : 'outline'}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {copy.actionLabel}
          </Button>
        </div>
      </div>

      {copy.closingWarning && (
        <p
          data-testid="stock-count-warning"
          className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {copy.closingWarning}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
