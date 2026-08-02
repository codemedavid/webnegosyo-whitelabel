'use client'

/**
 * Selling a client more branches or more seats.
 *
 * Lowering either number is allowed and takes nothing away: the caps are
 * enforced when something new is created, so a tenant moved onto a smaller plan
 * keeps the branches and staff they already have. The dialog says that out loud
 * when it applies rather than blocking the edit — refusing it would mean a
 * client downgrading their plan could never be moved onto it.
 */

import { useState, useTransition } from 'react'
import { updateTenantLimitsAction } from '@/app/actions/subscriptions'
import { MIN_OUTLET_ALLOWANCE, type AllowanceRow } from '@/lib/billing/tenant-allowances'

interface AllowanceDialogProps {
  tenantName: string
  allowance: AllowanceRow
  onClose: () => void
  onSaved: () => void
}

export function AllowanceDialog({
  tenantName,
  allowance,
  onClose,
  onSaved,
}: AllowanceDialogProps) {
  const [outlets, setOutlets] = useState(String(allowance.outletLimit))
  const [staff, setStaff] = useState(String(allowance.staffLimit))
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // A downgrade is only worth mentioning when it actually strands something the
  // tenant already holds. Warning on every reduction would train the owner to
  // ignore the one that matters.
  const isStrandingOutlets = Number(outlets) < allowance.outletsUsed
  const isStrandingStaff = Number(staff) < allowance.peakBranchStaff

  const handleSubmit = () => {
    setError(null)

    startTransition(async () => {
      const result = await updateTenantLimitsAction(allowance.tenantId, {
        maxOutlets: Number(outlets),
        maxStaffPerBranch: Number(staff),
      })

      if (!result.success) {
        setError(result.error)
        return
      }

      onSaved()
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-neutral-900">Plan allowances</h2>
        <p className="mt-1 text-sm text-neutral-500">{tenantName}</p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-sm" htmlFor="allowance-outlets">
            <span className="text-neutral-600">Branches</span>
            <input
              id="allowance-outlets"
              type="number"
              min={MIN_OUTLET_ALLOWANCE}
              value={outlets}
              onChange={(e) => setOutlets(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
            />
            <span className="mt-1 block text-xs text-neutral-500">
              {allowance.outletsUsed} in use
            </span>
          </label>

          <label className="text-sm" htmlFor="allowance-staff">
            <span className="text-neutral-600">Staff per branch</span>
            <input
              id="allowance-staff"
              type="number"
              min={0}
              value={staff}
              onChange={(e) => setStaff(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
            />
            <span className="mt-1 block text-xs text-neutral-500">
              {allowance.peakBranchStaff} in the fullest branch
            </span>
          </label>
        </div>

        {/* Seats are counted per branch and exclude the owner — the same rule
            the merchant's own staff screen reports back to them. */}
        <p className="mt-3 text-xs text-neutral-500">
          Seats are per branch and never count the owner.
        </p>

        {(isStrandingOutlets || isStrandingStaff) && (
          <p
            data-testid="allowance-downgrade-note"
            className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            This is below what they already have. Nothing is removed — they keep
            it, and simply cannot add more.
          </p>
        )}

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
            {isPending ? 'Saving…' : 'Save allowances'}
          </button>
        </div>
      </div>
    </div>
  )
}
