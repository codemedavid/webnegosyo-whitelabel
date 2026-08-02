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
import {
  DIALOG_CANCEL_BUTTON,
  DIALOG_FIELD,
  DIALOG_HINT,
  DIALOG_LABEL,
  DIALOG_PRIMARY_BUTTON,
} from '@/components/superadmin/ui/dialog-tokens'

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-neutral-950 p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-white">Plan allowances</h2>
        <p className="mt-1 text-sm text-white/55">{tenantName}</p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-sm" htmlFor="allowance-outlets">
            <span className={DIALOG_LABEL}>Branches</span>
            <input
              id="allowance-outlets"
              type="number"
              min={MIN_OUTLET_ALLOWANCE}
              value={outlets}
              onChange={(e) => setOutlets(e.target.value)}
              className={DIALOG_FIELD}
            />
            <span className="mt-1 block text-xs text-white/45">
              {allowance.outletsUsed} in use
            </span>
          </label>

          <label className="text-sm" htmlFor="allowance-staff">
            <span className={DIALOG_LABEL}>Staff per branch</span>
            <input
              id="allowance-staff"
              type="number"
              min={0}
              value={staff}
              onChange={(e) => setStaff(e.target.value)}
              className={DIALOG_FIELD}
            />
            <span className="mt-1 block text-xs text-white/45">
              {allowance.peakBranchStaff} in the fullest branch
            </span>
          </label>
        </div>

        {/* Seats are counted per branch and exclude the owner — the same rule
            the merchant's own staff screen reports back to them. */}
        <p className={DIALOG_HINT}>
          Seats are per branch and never count the owner.
        </p>

        {(isStrandingOutlets || isStrandingStaff) && (
          <p
            data-testid="allowance-downgrade-note"
            className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-200"
          >
            This is below what they already have. Nothing is removed — they keep
            it, and simply cannot add more.
          </p>
        )}

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
            {isPending ? 'Saving…' : 'Save allowances'}
          </button>
        </div>
      </div>
    </div>
  )
}
