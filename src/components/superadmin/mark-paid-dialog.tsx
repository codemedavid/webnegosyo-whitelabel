'use client'

/**
 * Recording a payment that has already arrived.
 *
 * Amount is prefilled with the tenant's own monthly price and stays editable,
 * because the real cases are a comped month, a partial, and a negotiated rate —
 * and a locked field would send the platform owner to the SQL console.
 */

import { useMemo, useState, useTransition } from 'react'
import { markTenantPaidAction } from '@/app/actions/subscriptions'
import { resolveAnchoredPeriod } from '@/lib/billing/billing-anchor'
import { toBusinessDayKey } from '@/lib/inventory/business-day'
import {
  DIALOG_CANCEL_BUTTON,
  DIALOG_FIELD,
  DIALOG_HINT,
  DIALOG_LABEL,
  DIALOG_PRIMARY_BUTTON,
} from '@/components/superadmin/ui/dialog-tokens'

const METHODS = ['gcash', 'bank', 'cash', 'other'] as const

interface MarkPaidDialogProps {
  tenantId: string
  tenantName: string
  monthlyPricePhp: number
  /** The client's billing anchor, or null when they bill from their pay day. */
  anchorDayKey: string | null
  /** The last day already bought, so an early payment shows as stacking. */
  paidThroughDayKey: string | null
  onClose: () => void
  onRecorded: () => void
}

/** A `YYYY-MM-DD` as a short human date, formatted in UTC so it cannot drift. */
function formatDayKey(dayKey: string): string {
  return new Date(`${dayKey}T00:00:00.000Z`).toLocaleDateString('en-PH', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function MarkPaidDialog({
  tenantId,
  tenantName,
  monthlyPricePhp,
  anchorDayKey,
  paidThroughDayKey,
  onClose,
  onRecorded,
}: MarkPaidDialogProps) {
  const [amount, setAmount] = useState(String(monthlyPricePhp))
  const [monthsInput, setMonths] = useState('1')
  const [method, setMethod] = useState<string>('gcash')
  const [reference, setReference] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  /**
   * The period this payment will buy, computed from the SAME function the
   * server uses.
   *
   * Shown before submitting because an anchored client's period is not "a month
   * from today" and the owner would otherwise only discover what they sold
   * after the ledger row was written. Recomputing it here with different
   * arithmetic would be worse than not showing it at all, so this imports the
   * real one.
   */
  const period = useMemo(() => {
    const months = Number(monthsInput)
    if (!Number.isInteger(months) || months < 1) return null

    try {
      return resolveAnchoredPeriod(
        anchorDayKey,
        paidThroughDayKey,
        toBusinessDayKey(new Date().toISOString()),
        months
      )
    } catch {
      // A preview is a courtesy; it must never stop a payment being recorded.
      return null
    }
  }, [anchorDayKey, paidThroughDayKey, monthsInput])

  const handleSubmit = () => {
    setError(null)

    startTransition(async () => {
      const result = await markTenantPaidAction({
        tenantId,
        amountPhp: Number(amount),
        periodMonths: Number(monthsInput),
        method,
        reference,
      })

      if (!result.success) {
        setError(result.error)
        return
      }

      onRecorded()
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-neutral-950 p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-white">Record payment</h2>
        <p className="mt-1 text-sm text-white/55">{tenantName}</p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className={DIALOG_LABEL}>Amount (₱)</span>
            <input
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={DIALOG_FIELD}
            />
          </label>

          <label className="text-sm">
            <span className={DIALOG_LABEL}>Months</span>
            <input
              type="number"
              min="1"
              value={monthsInput}
              onChange={(e) => setMonths(e.target.value)}
              className={DIALOG_FIELD}
            />
          </label>

          <label className="text-sm">
            <span className={DIALOG_LABEL}>Method</span>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className={`${DIALOG_FIELD} capitalize`}
            >
              {METHODS.map((m) => (
                <option key={m} value={m} className="bg-neutral-900 text-white">
                  {m}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className={DIALOG_LABEL}>Reference</span>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Transfer ref no."
              className={DIALOG_FIELD}
            />
          </label>
        </div>

        {/* The reference is what the merchant quotes when they dispute a
            charge months later, so it is worth a nudge even though it is
            optional. */}
        <p className={DIALOG_HINT} data-testid="mark-paid-period">
          {period
            ? `This buys ${formatDayKey(period.periodStart)} – ${formatDayKey(period.periodEnd)}.`
            : 'Paying early stacks onto the current period — no days are lost.'}
        </p>

        {error && (
          <p className="mt-3 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className={DIALOG_CANCEL_BUTTON}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className={DIALOG_PRIMARY_BUTTON}
          >
            {isPending ? 'Recording…' : 'Record payment'}
          </button>
        </div>
      </div>
    </div>
  )
}
