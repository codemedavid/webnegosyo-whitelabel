'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StockHistoryList } from '@/components/admin/stock-history-list'
import { BranchStockPanel } from '@/components/admin/branch-stock-panel'
import type { BranchStockSummary } from '@/lib/inventory/branch-stock-summary'
import type { InventoryItem, InventoryUnitRow } from '@/types/database'
import { EMPTY_STOCK_DRAFT, buildStockMovementInput, describeDeliveryPriceUnit, type StockMovementDraft } from '@/lib/inventory/stock-form'
import { MANUAL_MOVEMENT_REASONS, MOVEMENT_ACTION_LABELS, MOVEMENT_REASON_LABELS, type StockMovementReason } from '@/lib/inventory/stock-ledger'
import { resolveDefaultMovementOutlet, STORE_POOL_LABEL, type SelectableBranch } from '@/lib/inventory/stock-outlet'
import { recordStockMovementAction, setBranchReorderLevelAction } from '@/app/actions/inventory'

/** Trims the trailing zeros a NUMERIC(16,4) round-trip leaves behind. */
function formatQuantity(quantity: number): string {
  return Number(quantity.toFixed(4)).toString()
}

/**
 * How long a stock movement may hang before we call it failed.
 *
 * The merchant is on mobile data in a kitchen. Without this the button reads
 * "Recording…" for as long as the network cares to stall, and the one thing
 * they cannot tell is whether the movement was saved.
 */
const RECORD_TIMEOUT_MS = 15_000

class TimeoutError extends Error {
  constructor() {
    super('timed out')
    this.name = 'TimeoutError'
  }
}

/**
 * Rejects when `promise` outruns `ms`.
 *
 * The request itself is not cancelled — a server action cannot be aborted from
 * here — so this reports a timeout without ever claiming the write was undone.
 * The copy says "nothing was saved" only for the cases where that is true, and
 * the refresh on reopen shows the merchant the authoritative figure either way.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError()), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

interface StockMovementDialogProps {
  tenantId: string
  tenantSlug: string
  item: InventoryItem
  reason?: StockMovementReason
  units: InventoryUnitRow[]
  branches: SelectableBranch[]
  branchStockByItemId?: Record<string, BranchStockSummary>
  openCountId: string | null
  openCountOutletId: string | null
  onSaved: (item: InventoryItem) => void
  onClose: () => void
}

/** Each open starts a fresh draft; failed writes keep it mounted for retry. */
export function StockMovementDialog({ tenantId, tenantSlug, item: stockItem, reason,
  units, branches, branchStockByItemId, openCountId, openCountOutletId, onSaved, onClose,
}: StockMovementDialogProps) {
  // No router.refresh() after a save: the inventory actions revalidate, and a
  // revalidating Server Action already re-renders this route in its response.
  const unitsById = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units])
  const unitLabel = (id: string) => unitsById.get(id)?.abbreviation ?? '—'
  const [stockDraft, setStockDraft] = useState<StockMovementDraft>(() => ({
    ...EMPTY_STOCK_DRAFT,
    unit_id: stockItem.stock_unit_id,
    outlet_id: resolveDefaultMovementOutlet(branches),
    ...(reason ? { reason } : {}),
  }))
  const [isRecording, setIsRecording] = useState(false)
  const [stockError, setStockError] = useState<string | null>(null)

  const handleRecordStock = async () => {
    let input
    try {
      // The open count is passed here rather than asked for on the form: a
      // merchant mid-count should not have to remember to tag each entry, and
      // `buildStockMovementInput` ignores it for every reason but `stocktake`.
      // The count's shelf comes too: a stocktake only files under the running
      // count when it is about the same shelf the count is.
      input = buildStockMovementInput(stockDraft, stockItem.id, openCountId, openCountOutletId)
    } catch (error) {
      setStockError(error instanceof Error ? error.message : 'Please check the form')
      return
    }

    setStockError(null)
    setIsRecording(true)
    try {
      const result = await withTimeout(
        recordStockMovementAction(tenantId, tenantSlug, input),
        RECORD_TIMEOUT_MS,
      )
      if (!result.success) {
        setStockError(result.error ?? 'Failed to record stock movement')
        return
      }
      // The server's figure replaces ours: a stale local total is exactly the
      // bug the ledger exists to prevent.
      const saved = result.data.item
      onSaved(saved)
      // The merchant's question is "is the shelf figure right now?", and the
      // server's authoritative answer is already in hand. "Stock updated"
      // confirmed an event; this confirms the outcome.
      toast.success(
        `${saved.name} — ${formatQuantity(saved.current_qty)} ${unitLabel(saved.stock_unit_id)} on hand`,
      )
      onClose()
    } catch (error) {
      // A timeout or a dropped connection. The dialog stays open with what the
      // merchant typed still in it, so Record is a retry and not a re-entry.
      setStockError(
        error instanceof TimeoutError
          ? 'That took too long, so we stopped waiting. We cannot tell whether it saved — close this and check the on-hand figure before recording it again.'
          : 'We could not reach the server, so nothing was saved. Check your connection and try again.',
      )
    } finally {
      setIsRecording(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85dvh] grid-rows-[auto_minmax(0,1fr)_auto]">
        <DialogHeader>
          <DialogTitle>{stockItem ? `Stock — ${stockItem.name}` : 'Stock'}</DialogTitle>
        </DialogHeader>

        {stockItem && (
          <div className="-mx-6 space-y-3 overflow-y-auto px-6">
            <p className="text-sm text-muted-foreground">
              {formatQuantity(stockItem.current_qty)} {unitLabel(stockItem.stock_unit_id)} on hand
            </p>

            {/*
              The figure above is the chain roll-up, which reads the same
              whether the stock is spread evenly or piled in one shop. This is
              where that difference becomes visible — and where the merchant is
              standing when they decide to move some.
            */}
            {branchStockByItemId?.[stockItem.id] && (
              <BranchStockPanel
                summary={branchStockByItemId[stockItem.id]}
                unitLabel={unitLabel(stockItem.stock_unit_id)}
                transfersHref={`/${tenantSlug}/admin/inventory/transfers`}
                storeReorderLevel={stockItem.reorder_level}
                onSetReorderLevel={(outletId, reorderLevel) => {
                  // Fire-and-forget: the action revalidates the page, and a
                  // threshold is a setting rather than a quantity — nothing
                  // downstream is waiting on it the way a movement is.
                  void setBranchReorderLevelAction(
                    tenantId,
                    tenantSlug,
                    stockItem.id,
                    outletId,
                    reorderLevel,
                  )
                }}
              />
            )}

            {/*
              Which shelf this movement touches. Only rendered for a store
              with branches — everyone else has one shelf, the store pool,
              and the dialog reads exactly as it always has. Order depletion
              already lands on the order's branch; without this the manual
              half of the ledger could only reach the pool.
            */}
            {branches.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="stock-outlet">
                  Applies to
                </Label>
                <Select
                  value={stockDraft.outlet_id ?? 'store-pool'}
                  onValueChange={(value) =>
                    setStockDraft((d) => ({
                      ...d,
                      outlet_id: value === 'store-pool' ? null : value,
                    }))
                  }
                >
                  <SelectTrigger id="stock-outlet">
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
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">What happened</Label>
              <div className="flex flex-wrap gap-1">
                {MANUAL_MOVEMENT_REASONS.map((reason) => (
                  <Button
                    key={reason}
                    type="button"
                    size="sm"
                    className="max-sm:h-11 max-sm:flex-1"
                    variant={stockDraft.reason === reason ? 'default' : 'outline'}
                    aria-pressed={stockDraft.reason === reason}
                    onClick={() => setStockDraft((d) => ({ ...d, reason }))}
                  >
                    {MOVEMENT_REASON_LABELS[reason]}
                  </Button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">{reasonHint(stockDraft.reason)}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="stock-qty">Quantity</Label>
                <Input
                  id="stock-qty"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0"
                  value={stockDraft.quantity}
                  onChange={(e) => setStockDraft((d) => ({ ...d, quantity: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="stock-unit">Unit</Label>
                <Select
                  value={stockDraft.unit_id || undefined}
                  onValueChange={(value) => setStockDraft((d) => ({ ...d, unit_id: value }))}
                >
                  <SelectTrigger id="stock-unit">
                    <SelectValue placeholder="Select a unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.abbreviation}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {stockDraft.reason === 'receive' && (
              <div className="space-y-1">
                {/*
                  The price is per the unit the merchant is entering in, and the
                  server converts it to the stock unit. Naming both is the whole
                  point: "Unit cost" beside a unit dropdown reads as either one,
                  and guessing wrong is a 1000x error the merchant cannot see
                  from this screen.
                */}
                <Label htmlFor="stock-cost">
                  {describeDeliveryPriceUnit(stockDraft.unit_id, stockItem.stock_unit_id, unitLabel)
                    .label}
                </Label>
                <Input
                  id="stock-cost"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={stockItem.unit_cost.toFixed(2)}
                  value={stockDraft.unit_cost}
                  onChange={(e) => setStockDraft((d) => ({ ...d, unit_cost: e.target.value }))}
                />
                <p className="text-[11px] text-muted-foreground">
                  Leave blank to keep the current cost. A price here is blended with the stock
                  already on hand.{' '}
                  {describeDeliveryPriceUnit(
                    stockDraft.unit_id,
                    stockItem.stock_unit_id,
                    unitLabel,
                  ).conversionHint ?? ''}
                </p>
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="stock-note">Note (optional)</Label>
              <Input
                id="stock-note"
                placeholder="e.g., delivery #1042"
                value={stockDraft.note}
                onChange={(e) => setStockDraft((d) => ({ ...d, note: e.target.value }))}
              />
            </div>

            <div className="space-y-2 border-t pt-3">
              <p className="text-xs font-medium">Recent movements</p>
              <StockHistoryList tenantId={tenantId} item={stockItem} units={units} />
            </div>
          </div>
        )}

        {stockError && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {stockError}
          </p>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            className="max-sm:h-11"
            onClick={() => onClose()}
          >
            Cancel
          </Button>
          <Button className="max-sm:h-11" onClick={handleRecordStock} disabled={isRecording}>
            {isRecording ? 'Recording…' : MOVEMENT_ACTION_LABELS[stockDraft.reason]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Explains what the quantity means, and what it will do to the shelf figure.
 *
 * The three movements do three different things to the total — one adds, one
 * subtracts, one replaces — and that is the part a merchant cannot see from
 * the field itself.
 */
function reasonHint(reason: StockMovementReason): string {
  if (reason === 'stocktake') return 'What you actually counted. This replaces the figure on hand.'
  if (reason === 'waste') return 'How much was thrown away. This comes off the figure on hand.'
  return 'How much arrived. This is added to the figure on hand.'
}
