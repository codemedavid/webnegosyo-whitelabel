'use client'

import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import type { AcceptedVoucherPreview } from '@/lib/vouchers/preview'

interface VoucherUnitChoiceProps {
  voucher: AcceptedVoucherPreview
  /** Dish name by preview line id. */
  lineNames: Readonly<Record<string, string>>
  onChoose: (code: string, picks: Record<string, number>) => void | Promise<void>
}

function appliesTo(voucher: AcceptedVoucherPreview, lineNames: Readonly<Record<string, string>>): string {
  const items = voucher.items ?? []
  if (items.length === 0) return 'nothing yet'
  return items.map((item) => `${lineNames[item.lineId] ?? 'Item'} ×${item.units}`).join(', ')
}

/**
 * "Applies to: Fries ×1 · Change" under a voucher that only discounts N
 * items. The cheapest item gets it by default; the customer can move it to
 * the dish they meant. The server re-checks the choice when the order is
 * placed.
 */
export function VoucherUnitChoice({ voucher, lineNames, onChoose }: VoucherUnitChoiceProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, number>>({})
  const limit = voucher.unitLimit ?? 0
  const lineIds = voucher.eligibleLineIds ?? []
  const total = Object.values(draft).reduce((sum, units) => sum + units, 0)

  if (limit < 1) return null

  const open = () => {
    setDraft(Object.fromEntries((voucher.items ?? []).map((item) => [item.lineId, item.units])))
    setIsEditing(true)
  }

  const change = (lineId: string, delta: number) =>
    setDraft((current) => ({ ...current, [lineId]: Math.max(0, (current[lineId] ?? 0) + delta) }))

  const save = async () => {
    setIsEditing(false)
    await onChoose(voucher.code, draft)
  }

  return (
    <div className="mt-1 rounded-md bg-[var(--co-subtle)] px-2 py-1.5 text-xs text-[color:var(--co-text)]">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0">
          Applies to: <span className="font-medium">{appliesTo(voucher, lineNames)}</span>
        </span>
        {!isEditing && lineIds.length > 1 && (
          <button type="button" onClick={open} className="shrink-0 font-semibold underline underline-offset-2">
            Change
          </button>
        )}
      </div>

      {isEditing && (
        <div className="mt-2 space-y-1.5">
          <p className="text-[color:var(--co-muted)]">
            Choose up to {limit} item{limit === 1 ? '' : 's'} ({total} chosen).
          </p>
          {lineIds.map((lineId) => {
            const value = draft[lineId] ?? 0
            const name = lineNames[lineId] ?? 'Item'
            return (
              <div key={lineId} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{name}</span>
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Fewer ${name}`}
                    onClick={() => change(lineId, -1)}
                    disabled={value === 0}
                    className="rounded border border-[color:var(--co-border)] p-1 disabled:opacity-40"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-4 text-center tabular-nums">{value}</span>
                  <button
                    type="button"
                    aria-label={`More ${name}`}
                    onClick={() => change(lineId, 1)}
                    disabled={total >= limit}
                    className="rounded border border-[color:var(--co-border)] p-1 disabled:opacity-40"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </span>
              </div>
            )
          })}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={() => setIsEditing(false)} className="text-[color:var(--co-muted)]">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={total === 0}
              className="font-semibold text-[color:var(--co-text)] disabled:opacity-40"
            >
              Use these
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
