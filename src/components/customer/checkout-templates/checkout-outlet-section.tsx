'use client'

/**
 * The chosen branch, as it appears inside the checkout form.
 *
 * The question itself is asked by `CheckoutOutletScreen`, which takes over the
 * route until it is answered; by the time this renders the answer exists, so
 * this is a one-line confirmation rather than a second copy of the picker.
 * "Change" drops the selection, which brings that screen straight back — the
 * same code path as never having chosen, so there is no second way to be in
 * this state.
 *
 * Renders nothing unless there is a branch to show, which keeps every
 * single-location tenant's checkout byte-identical to today's.
 */

import { MapPin } from 'lucide-react'
import type { UseCheckoutOutletResult } from '@/hooks/use-checkout-outlet'

interface CheckoutOutletSummaryProps {
  outlet: UseCheckoutOutletResult
}

export function CheckoutOutletSummary({ outlet }: CheckoutOutletSummaryProps) {
  if (!outlet.isPickerVisible || !outlet.selectedOutletId) return null

  const chosen = outlet.choices.find((entry) => entry.outlet.id === outlet.selectedOutletId)
  if (!chosen) return null

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="flex min-w-0 items-center gap-2">
        <MapPin className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-xs text-gray-500">Ordering from</p>
          <p className="truncate font-medium text-gray-900">{chosen.outlet.name}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={outlet.clearSelection}
        className="shrink-0 text-sm font-medium text-gray-600 underline underline-offset-4 hover:text-gray-900"
      >
        Change
      </button>
    </div>
  )
}
