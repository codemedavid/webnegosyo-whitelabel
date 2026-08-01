'use client'

/**
 * Where a transfer is actually performed.
 *
 * `transfers-view.ts` decides what each row says and which buttons it may
 * offer; this renders that and nothing more. The division is what keeps the
 * authority rule in one place — the screen cannot offer a button the service
 * will refuse, because it does not decide which buttons exist.
 *
 * The receive step expands INLINE rather than opening a dialog. Counting a
 * delivery in means standing at a bench with a box, reading each line off it;
 * a modal that hides the transfer behind the form makes the merchant remember
 * what they are checking instead of looking at it.
 *
 * Renders NOTHING for a single-shop store, which can never transfer anything.
 */

import { useState } from 'react'
import { ArrowRight, AlertTriangle, PackageCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { groupTransfers, type TransferListItem, type TransferView } from '@/lib/inventory/transfers-view'
import type { NamedBranch } from '@/lib/inventory/branch-stock-view'
import type { BranchScope } from '@/lib/outlets/branch-scope'

/** Matches `inventory-table.ts` — NUMERIC(16,4) without a trailing zero parade. */
const formatQuantity = (quantity: number): string => Number(quantity.toFixed(4)).toString()

/** Quantities are NUMERIC(16,4); anything under this is round-trip dust. */
const QUANTITY_EPSILON = 1e-4

interface StockTransfersPanelProps {
  transfers: readonly TransferListItem[]
  branches: readonly NamedBranch[]
  scope: BranchScope
  onSend: (transferId: string) => void
  onReceive: (transferId: string, counts: Record<string, number>) => void
  onCancel: (transferId: string) => void
  isBusy?: boolean
}

export function StockTransfersPanel({
  transfers,
  branches,
  scope,
  onSend,
  onReceive,
  onCancel,
  isBusy = false,
}: StockTransfersPanelProps) {
  const [countingId, setCountingId] = useState<string | null>(null)

  // One branch cannot transfer to itself, so there is nothing here to show.
  if (branches.length < 2) return null

  const groups = groupTransfers(transfers, scope, branches)
  const hasAny = groups.inTransit.length + groups.drafts.length + groups.history.length > 0

  // The group heading already names the status, so a row only repeats it where
  // the group is mixed — "Completed" holds both received and cancelled.
  const row = (view: TransferView, showStatus: boolean) => (
    <TransferRow
      key={view.id}
      view={view}
      showStatus={showStatus}
      isCounting={countingId === view.id}
      isBusy={isBusy}
      onStartCount={() => setCountingId(view.id)}
      onAbandonCount={() => setCountingId(null)}
      onSend={onSend}
      onCancel={onCancel}
      onReceive={(counts) => {
        setCountingId(null)
        onReceive(view.id, counts)
      }}
    />
  )

  return (
    <section className="space-y-4">
      {!hasAny && (
        <p className="text-sm text-muted-foreground">
          No transfers yet. Move stock between branches when one runs short.
        </p>
      )}

      {/* In transit first: this stock is on nobody's shelf, and every hour it
          stays there is an hour two branches are both counting it wrong. */}
      <TransferGroup
        title="In transit"
        views={groups.inTransit}
        render={(view) => row(view, false)}
      />
      <TransferGroup title="Drafts" views={groups.drafts} render={(view) => row(view, false)} />
      <TransferGroup title="Completed" views={groups.history} render={(view) => row(view, true)} />
    </section>
  )
}

function TransferGroup({
  title,
  views,
  render,
}: {
  title: string
  views: TransferView[]
  render: (view: TransferView) => React.ReactNode
}) {
  if (views.length === 0) return null

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <ul className="space-y-2">{views.map(render)}</ul>
    </div>
  )
}

function TransferRow({
  view,
  showStatus,
  isCounting,
  isBusy,
  onStartCount,
  onAbandonCount,
  onSend,
  onCancel,
  onReceive,
}: {
  view: TransferView
  showStatus: boolean
  isCounting: boolean
  isBusy: boolean
  onStartCount: () => void
  onAbandonCount: () => void
  onSend: (id: string) => void
  onCancel: (id: string) => void
  onReceive: (counts: Record<string, number>) => void
}) {
  return (
    <li className="rounded-md border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium">
          <span>{view.from}</span>
          {/* A text arrow, not an icon: an aria-hidden icon between two branch
              names announces as "North South" — the reading that sends stock
              the wrong way. */}
          <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">to</span>
          <span>{view.to}</span>
        </div>
        {showStatus && (
          <span className="text-xs text-muted-foreground">{view.statusLabel}</span>
        )}
      </div>

      <ul className="mt-2 space-y-0.5 text-muted-foreground">
        {view.lines.map((line) => (
          <li key={line.inventoryItemId} className="flex justify-between gap-3">
            <span>{line.name}</span>
            <span className="tabular-nums">
              {formatQuantity(line.sentQuantity)} {line.unit}
            </span>
          </li>
        ))}
      </ul>

      {view.shortfallCount > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {view.shortfallCount === 1
            ? '1 ingredient arrived short'
            : `${view.shortfallCount} ingredients arrived short`}
        </p>
      )}

      {isCounting ? (
        <ReceiveForm view={view} isBusy={isBusy} onConfirm={onReceive} onAbandon={onAbandonCount} />
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {view.actions.includes('send') && (
            <Button size="sm" disabled={isBusy} onClick={() => onSend(view.id)}>
              Send
            </Button>
          )}
          {view.actions.includes('receive') && (
            <Button size="sm" disabled={isBusy} onClick={onStartCount}>
              <PackageCheck className="h-4 w-4" aria-hidden="true" />
              Receive
            </Button>
          )}
          {view.actions.includes('cancel') && (
            <Button size="sm" variant="ghost" disabled={isBusy} onClick={() => onCancel(view.id)}>
              Cancel
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * Counting a delivery in.
 *
 * Each field STARTS at what was sent. The common case is that everything
 * arrived, and starting blank would make the honest path the laborious one —
 * which is how a merchant learns to skip the step the whole document exists
 * for. Changing a figure is then a deliberate act, which is exactly what
 * recording a shortfall should be.
 */
function ReceiveForm({
  view,
  isBusy,
  onConfirm,
  onAbandon,
}: {
  view: TransferView
  isBusy: boolean
  onConfirm: (counts: Record<string, number>) => void
  onAbandon: () => void
}) {
  const [counts, setCounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(view.lines.map((line) => [line.inventoryItemId, String(line.sentQuantity)])),
  )

  const parsed = view.lines.map((line) => ({
    line,
    value: Number(counts[line.inventoryItemId]),
  }))

  const hasInvalid = parsed.some(
    ({ line, value }) => !Number.isFinite(value) || value < 0 || value > line.sentQuantity,
  )
  const shortLines = parsed.filter(
    ({ line, value }) => Number.isFinite(value) && line.sentQuantity - value > QUANTITY_EPSILON,
  )

  return (
    <div className="mt-3 space-y-3 rounded-md border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">
        Count what actually arrived. Anything missing is recorded against {view.from}.
      </p>

      {view.lines.map((line) => (
        <div key={line.inventoryItemId} className="flex items-center justify-between gap-3">
          <label htmlFor={`count-${view.id}-${line.inventoryItemId}`} className="flex-1">
            {line.name}
            <span className="ml-1 text-muted-foreground">
              (sent {formatQuantity(line.sentQuantity)} {line.unit})
            </span>
          </label>
          <Input
            id={`count-${view.id}-${line.inventoryItemId}`}
            type="number"
            inputMode="decimal"
            min={0}
            max={line.sentQuantity}
            className="w-28"
            value={counts[line.inventoryItemId] ?? ''}
            onChange={(event) =>
              // A new object rather than a mutation, so React sees the change.
              setCounts((current) => ({
                ...current,
                [line.inventoryItemId]: event.target.value,
              }))
            }
          />
        </div>
      ))}

      {shortLines.length > 0 && !hasInvalid && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {shortLines.length === 1 ? '1 ingredient is' : `${shortLines.length} ingredients are`}{' '}
          short. This books shrinkage against {view.from}.
        </p>
      )}

      {hasInvalid && (
        <p className="text-xs text-destructive">
          A count has to be between zero and what was sent.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={isBusy || hasInvalid}
          onClick={() =>
            onConfirm(
              Object.fromEntries(parsed.map(({ line, value }) => [line.inventoryItemId, value])),
            )
          }
        >
          Confirm delivery
        </Button>
        <Button size="sm" variant="ghost" disabled={isBusy} onClick={onAbandon}>
          Back
        </Button>
      </div>
    </div>
  )
}
