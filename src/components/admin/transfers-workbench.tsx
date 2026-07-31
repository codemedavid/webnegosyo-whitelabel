'use client'

/**
 * The transfers screen: draft one, then act on the ones that exist.
 *
 * Drafting lives here and the lifecycle lives in `StockTransfersPanel`, because
 * they are different jobs done at different moments — an owner composes a
 * transfer at a desk, and a manager counts one in at a bench. Keeping the
 * composition form out of the panel means the bench view is a list of boxes
 * rather than a list of boxes underneath a form nobody at the bench will use.
 *
 * Every refusal here is the server's own words. The narrowing this component
 * does — a branch manager cannot pick another branch as the source — is a
 * courtesy, not a boundary: `stock-transfers-service.ts` re-checks against
 * `app_users`, and that is the check that actually protects the stock.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StockTransfersPanel } from '@/components/admin/stock-transfers-panel'
import {
  createStockTransferAction,
  sendStockTransferAction,
  receiveStockTransferAction,
  cancelStockTransferAction,
} from '@/app/actions/inventory-transfers'
import { canSendTransfer } from '@/lib/inventory/stock-transfer'
import type { TransferListItem } from '@/lib/inventory/transfers-view'
import type { NamedBranch } from '@/lib/inventory/branch-stock-view'
import type { BranchScope } from '@/lib/outlets/branch-scope'

/** The unbranched pool is a real place stock sits, so it is a real option. */
const POOL_VALUE = '__pool__'

export interface TransferIngredient {
  id: string
  name: string
  unit: string
}

interface TransfersWorkbenchProps {
  tenantId: string
  tenantSlug: string
  transfers: readonly TransferListItem[]
  branches: readonly NamedBranch[]
  ingredients: readonly TransferIngredient[]
  scope: BranchScope
}

interface DraftLine {
  inventoryItemId: string
  quantity: number
}

const toOutletId = (value: string): string | null => (value === POOL_VALUE ? null : value)
const toSelectValue = (outletId: string | null): string => outletId ?? POOL_VALUE

export function TransfersWorkbench({
  tenantId,
  tenantSlug,
  transfers,
  branches,
  ingredients,
  scope,
}: TransfersWorkbenchProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // A branch manager may only send their own stock, so their source is fixed.
  const isBranchLocked = scope.kind === 'branch'
  const [fromValue, setFromValue] = useState(() =>
    isBranchLocked ? scope.outletId : toSelectValue(branches[0]?.id ?? null),
  )
  const [toValue, setToValue] = useState(() => toSelectValue(branches[1]?.id ?? null))
  const [lines, setLines] = useState<DraftLine[]>([])
  const [itemId, setItemId] = useState(() => ingredients[0]?.id ?? '')
  const [quantity, setQuantity] = useState('')

  const fromOutletId = toOutletId(fromValue)
  const toOutletId_ = toOutletId(toValue)

  const isSameBranch = fromValue === toValue
  const maySend = canSendTransfer(scope, fromOutletId)
  const canCreate = lines.length > 0 && !isSameBranch && maySend && !isPending

  /** Runs a lifecycle action and reports its answer in the server's own words. */
  const run = (action: () => Promise<{ success: boolean; error?: string }>, done: string) => {
    startTransition(async () => {
      const result = await action()
      if (result.success) {
        toast.success(done)
        router.refresh()
        return
      }
      toast.error(result.error ?? 'That did not work')
    })
  }

  const addLine = () => {
    const parsed = Number(quantity)
    if (!itemId || !Number.isFinite(parsed) || parsed <= 0) return

    setLines((current) => {
      // One line per ingredient — the transfer schema has a unique index on it,
      // so a second line would be refused after the merchant had typed it.
      const existing = current.find((line) => line.inventoryItemId === itemId)
      if (existing) {
        return current.map((line) =>
          line.inventoryItemId === itemId ? { ...line, quantity: parsed } : line,
        )
      }
      return [...current, { inventoryItemId: itemId, quantity: parsed }]
    })
    setQuantity('')
  }

  const createTransfer = () => {
    if (!canCreate) return
    startTransition(async () => {
      const result = await createStockTransferAction(tenantId, tenantSlug, {
        fromOutletId,
        toOutletId: toOutletId_,
        lines,
      })
      if (result.success) {
        toast.success('Transfer drafted')
        setLines([])
        router.refresh()
        return
      }
      toast.error(result.error ?? 'Failed to create the transfer')
    })
  }

  const nameOf = (id: string) => ingredients.find((item) => item.id === id)?.name ?? 'Ingredient'
  const unitOf = (id: string) => ingredients.find((item) => item.id === id)?.unit ?? ''

  const branchOptions = (
    <>
      <option value={POOL_VALUE}>Store pool</option>
      {branches.map((branch) => (
        <option key={branch.id} value={branch.id}>
          {branch.name}
        </option>
      ))}
    </>
  )

  return (
    <div className="space-y-8">
      <section className="space-y-4 rounded-lg border p-4">
        <h2 className="text-sm font-semibold">New transfer</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="transfer-from" className="text-xs font-medium">
              From
            </label>
            <select
              id="transfer-from"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={fromValue}
              disabled={isBranchLocked}
              onChange={(event) => setFromValue(event.target.value)}
            >
              {branchOptions}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="transfer-to" className="text-xs font-medium">
              To
            </label>
            <select
              id="transfer-to"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={toValue}
              onChange={(event) => setToValue(event.target.value)}
            >
              {branchOptions}
            </select>
          </div>
        </div>

        {isSameBranch && (
          <p className="text-xs text-destructive">
            A transfer has to go somewhere else. Pick a different branch.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
          <div className="space-y-1">
            <label htmlFor="transfer-item" className="text-xs font-medium">
              Ingredient
            </label>
            <select
              id="transfer-item"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={itemId}
              onChange={(event) => setItemId(event.target.value)}
            >
              {ingredients.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="transfer-qty" className="text-xs font-medium">
              Quantity
            </label>
            <Input
              id="transfer-qty"
              type="number"
              inputMode="decimal"
              min={0}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </div>

          <Button type="button" variant="secondary" onClick={addLine}>
            Add to transfer
          </Button>
        </div>

        {lines.length > 0 && (
          <ul className="space-y-1 rounded-md border bg-muted/30 p-3 text-sm">
            {lines.map((line) => (
              <li key={line.inventoryItemId} className="flex items-center justify-between gap-3">
                <span>{nameOf(line.inventoryItemId)}</span>
                <span className="flex items-center gap-2 tabular-nums">
                  {line.quantity} {unitOf(line.inventoryItemId)}
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove ${nameOf(line.inventoryItemId)}`}
                    onClick={() =>
                      setLines((current) =>
                        current.filter((l) => l.inventoryItemId !== line.inventoryItemId),
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">
          Drafting moves nothing. The stock leaves the shelf when you send it.
        </p>

        <Button type="button" disabled={!canCreate} onClick={createTransfer}>
          Create transfer
        </Button>
      </section>

      <StockTransfersPanel
        transfers={transfers}
        branches={branches}
        scope={scope}
        isBusy={isPending}
        onSend={(id) => run(() => sendStockTransferAction(tenantId, tenantSlug, id), 'Transfer sent')}
        onReceive={(id, counts) =>
          run(
            () => receiveStockTransferAction(tenantId, tenantSlug, id, counts),
            'Delivery recorded',
          )
        }
        onCancel={(id) =>
          run(() => cancelStockTransferAction(tenantId, tenantSlug, id), 'Transfer cancelled')
        }
      />
    </div>
  )
}
