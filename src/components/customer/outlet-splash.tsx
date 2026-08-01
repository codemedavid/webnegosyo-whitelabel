'use client'

import { useEffect, useMemo, useState } from 'react'
import { OutletModeScreen } from '@/components/customer/outlet-mode-screen'
import { OutletPickerScreen, type PickerOutlet } from '@/components/customer/outlet-picker-screen'
import { resolveAvailableModes } from '@/lib/outlets/outlet-modes'
import type { OutletOrderMode, RankedOutlet } from '@/lib/outlets/nearest-outlet'

interface OutletSplashProps {
  tenantName: string
  /** Optional promo image shown above the choices; absent renders no gap. */
  promoImageUrl?: string | null
  promoHeadline?: string | null
  /** Every active branch — the modes on offer are derived from these. */
  outlets: readonly PickerOutlet[]
  /** Why we are asking — drives the explanatory line, if any. */
  reason: string | null
  isLocating: boolean
  onLocate: () => void
  rankFor: (mode: OutletOrderMode) => { outlets: RankedOutlet<PickerOutlet>[] }
  onSelect: (outletId: string, mode: OutletOrderMode) => void
}

const REASON_MESSAGE: Record<string, string> = {
  'unknown-link': 'That branch link is no longer available — please pick a branch.',
  'outlet-unavailable': 'The branch you chose last time is closed. Please pick another.',
  'mode-unsupported': 'Your usual branch no longer offers that option. Please choose again.',
}

/**
 * Full-screen branch chooser: how do you want your order, then from where.
 *
 * Shown only when the tenant has two or more active branches and the customer
 * has not already chosen one. Handing off to the existing menu unchanged is the
 * whole point — this never wraps or replaces it.
 *
 * The two screens are one component because they share one piece of state (the
 * chosen mode) and one exit (a branch id plus that mode). Splitting them across
 * routes would put the customer's half-made choice in the URL, where the back
 * button and a stale link could contradict it.
 */
export function OutletSplash({
  tenantName,
  promoImageUrl,
  promoHeadline,
  outlets,
  reason,
  isLocating,
  onLocate,
  rankFor,
  onSelect,
}: OutletSplashProps) {
  const [mode, setMode] = useState<OutletOrderMode | null>(null)

  // Offer to locate once, in the background. Neither screen waits on it.
  useEffect(() => {
    onLocate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const modes = useMemo(() => resolveAvailableModes(outlets), [outlets])

  // One clock reading for the whole picker: deriving `new Date()` per card
  // would let two branches on the same screen disagree across a midnight
  // boundary. Safe to read at first render because this component only mounts
  // after hydration, so there is no server markup for it to contradict. Re-read
  // on each mode change so a long-idle tab does not show yesterday's status.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => setNow(new Date()), [mode])

  // A tenant offering exactly one mode is not asking a question. Skip straight
  // to the branch list rather than showing a single tile that must be tapped —
  // and then there is nothing to go back to.
  const isModeForced = modes.length === 1
  const effectiveMode = mode ?? (isModeForced ? modes[0] : null)

  const message = reason ? REASON_MESSAGE[reason] : null

  return (
    <div className="fixed inset-0 z-[110] overflow-y-auto bg-background">
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col">
        {effectiveMode === null ? (
          <OutletModeScreen
            tenantName={tenantName}
            promoImageUrl={promoImageUrl}
            promoHeadline={promoHeadline}
            modes={modes}
            message={message}
            onSelect={setMode}
          />
        ) : (
          <OutletPickerScreen
            mode={effectiveMode}
            ranked={rankFor(effectiveMode).outlets}
            isLocating={isLocating}
            onLocate={onLocate}
            onBack={isModeForced ? null : () => setMode(null)}
            onSelect={(outletId) => onSelect(outletId, effectiveMode)}
            now={now}
          />
        )}
      </div>
    </div>
  )
}
