'use client'

/**
 * Setting the date a client's subscription month turns over.
 *
 * The owner knows a client started on 1 August; billing should agree. Until
 * this exists, a payment always started a month on the day it was recorded, so
 * a client who paid late moved their own renewal date and never moved it back.
 *
 * Deliberately says what it will NOT do. This screen's neighbouring button
 * marks people paid, and a date field beside it that quietly extended access
 * would be the easiest mistake on the platform to make and the hardest to
 * notice — so the dialog states plainly that nothing is granted here.
 */

import { useState, useTransition } from 'react'
import { setTenantBillingAnchorAction } from '@/app/actions/subscriptions'
import {
  DIALOG_CANCEL_BUTTON,
  DIALOG_FIELD,
  DIALOG_HINT,
  DIALOG_LABEL,
  DIALOG_PRIMARY_BUTTON,
} from '@/components/superadmin/ui/dialog-tokens'

interface BillingAnchorDialogProps {
  tenantId: string
  tenantName: string
  /** The current anchor, or null when the client bills from their pay day. */
  anchorDayKey: string | null
  onClose: () => void
  onSaved: () => void
}

export function BillingAnchorDialog({
  tenantId,
  tenantName,
  anchorDayKey,
  onClose,
  onSaved,
}: BillingAnchorDialogProps) {
  const [anchorDate, setAnchorDate] = useState(anchorDayKey ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const submit = (nextAnchor: string | null) => {
    setError(null)

    startTransition(async () => {
      const result = await setTenantBillingAnchorAction(tenantId, nextAnchor)

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
        <h2 className="text-lg font-bold text-white">Billing start date</h2>
        <p className="mt-1 text-sm text-white/55">{tenantName}</p>

        <label className="mt-4 block text-sm">
          <span className={DIALOG_LABEL}>Their month turns over on</span>
          {/* A date picker, not a text box: a hand-typed date is rejected by
              the action, and being refused for a slash instead of a dash is a
              pointless way to lose someone's afternoon. */}
          <input
            type="date"
            value={anchorDate}
            onChange={(event) => setAnchorDate(event.target.value)}
            data-testid="billing-anchor-input"
            className={DIALOG_FIELD}
          />
        </label>

        <p className={DIALOG_HINT}>
          Set 1 August and every month runs the 1st to the end of the month —
          even when they pay late. This grants no access on its own; only
          recording a payment does that.
        </p>

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300"
          >
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-between gap-2">
          {/* Clearing has to be reachable, or a mistyped date is permanent and
              the client is stuck on a turnover day nobody chose. */}
          <button
            type="button"
            onClick={() => submit(null)}
            disabled={isPending || anchorDayKey === null}
            data-testid="billing-anchor-clear"
            className={`${DIALOG_CANCEL_BUTTON} disabled:opacity-40`}
          >
            Clear
          </button>

          <div className="flex gap-2">
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
              onClick={() => submit(anchorDate)}
              disabled={isPending || anchorDate === ''}
              className={DIALOG_PRIMARY_BUTTON}
            >
              {isPending ? 'Saving…' : 'Save start date'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
