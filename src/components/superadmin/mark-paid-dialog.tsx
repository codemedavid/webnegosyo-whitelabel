'use client'

/**
 * Recording a payment that has already arrived.
 *
 * Amount is prefilled with the tenant's own monthly price and stays editable,
 * because the real cases are a comped month, a partial, and a negotiated rate —
 * and a locked field would send the platform owner to the SQL console.
 */

import { useState, useTransition } from 'react'
import { markTenantPaidAction } from '@/app/actions/subscriptions'

const METHODS = ['gcash', 'bank', 'cash', 'other'] as const

interface MarkPaidDialogProps {
  tenantId: string
  tenantName: string
  monthlyPricePhp: number
  onClose: () => void
  onRecorded: () => void
}

export function MarkPaidDialog({
  tenantId,
  tenantName,
  monthlyPricePhp,
  onClose,
  onRecorded,
}: MarkPaidDialogProps) {
  const [amount, setAmount] = useState(String(monthlyPricePhp))
  const [months, setMonths] = useState('1')
  const [method, setMethod] = useState<string>('gcash')
  const [reference, setReference] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleSubmit = () => {
    setError(null)

    startTransition(async () => {
      const result = await markTenantPaidAction({
        tenantId,
        amountPhp: Number(amount),
        periodMonths: Number(months),
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-neutral-900">Record payment</h2>
        <p className="mt-1 text-sm text-neutral-500">{tenantName}</p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="text-neutral-600">Amount (₱)</span>
            <input
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
            />
          </label>

          <label className="text-sm">
            <span className="text-neutral-600">Months</span>
            <input
              type="number"
              min="1"
              value={months}
              onChange={(e) => setMonths(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
            />
          </label>

          <label className="text-sm">
            <span className="text-neutral-600">Method</span>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 capitalize"
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="text-neutral-600">Reference</span>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Transfer ref no."
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
            />
          </label>
        </div>

        {/* The reference is what the merchant quotes when they dispute a
            charge months later, so it is worth a nudge even though it is
            optional. */}
        <p className="mt-3 text-xs text-neutral-500">
          Paying early stacks onto the current period — no days are lost.
        </p>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {isPending ? 'Recording…' : 'Record payment'}
          </button>
        </div>
      </div>
    </div>
  )
}
