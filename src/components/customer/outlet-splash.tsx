'use client'

import { useEffect, useMemo, useState } from 'react'
import { OutletModeScreen } from '@/components/customer/outlet-mode-screen'
import { OutletPickerScreen, type PickerOutlet } from '@/components/customer/outlet-picker-screen'
import { resolveAvailableModes } from '@/lib/outlets/outlet-modes'
import { shouldShowOrderTypeStep, type WelcomeTenantFields } from '@/lib/outlets/welcome-page'
import type { OutletOrderMode, RankedOutlet } from '@/lib/outlets/nearest-outlet'
import type { Tenant } from '@/types/database'

interface OutletSplashProps {
  tenantName: string
  /** Full tenant row — feeds the branded store header on the welcome page. */
  tenant?: Tenant | null
  /** Store logo for the welcome header, when the merchant enables it. */
  logoUrl?: string | null
  /** Optional promo image shown above the choices; absent renders no gap. */
  promoImageUrl?: string | null
  promoHeadline?: string | null
  /** Every active branch — the modes on offer are derived from these. */
  outlets: readonly PickerOutlet[]
  /** Why we are asking — drives the explanatory line, if any. */
  reason: string | null
  isLocating: boolean
  onLocate: () => void
  /** Mode null ranks every active branch (single-CTA entry). */
  rankFor: (mode: OutletOrderMode | null) => { outlets: RankedOutlet<PickerOutlet>[] }
  /** Mode null = the customer entered via the CTA; checkout asks the mode. */
  onSelect: (outletId: string, mode: OutletOrderMode | null) => void
  /** Welcome-page design columns; null/absent keeps the shipped screen. */
  welcome?: WelcomeTenantFields | null
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
  tenant,
  logoUrl,
  promoImageUrl,
  promoHeadline,
  outlets,
  reason,
  isLocating,
  onLocate,
  rankFor,
  onSelect,
  welcome,
}: OutletSplashProps) {
  const [mode, setMode] = useState<OutletOrderMode | null>(null)
  // Single-CTA entry: the welcome page shows one button, and pressing it goes
  // straight to the branch list with no mode chosen — checkout asks instead.
  const showTiles = shouldShowOrderTypeStep(welcome)
  const [hasStarted, setHasStarted] = useState(false)

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
  useEffect(() => setNow(new Date()), [mode, hasStarted])

  // A tenant offering exactly one mode is not asking a question. Skip straight
  // to the branch list rather than showing a single tile that must be tapped —
  // and then there is nothing to go back to. The CTA entry never skips: the
  // welcome page IS the merchant's branded front door.
  const isModeForced = showTiles && modes.length === 1
  const effectiveMode = mode ?? (isModeForced ? modes[0] : null)

  const isPickerOpen = showTiles ? effectiveMode !== null : hasStarted
  const pickerMode = showTiles ? effectiveMode : null

  const message = reason ? REASON_MESSAGE[reason] : null

  return (
    <div className="fixed inset-0 z-[110] overflow-y-auto bg-background">
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col">
        {!isPickerOpen ? (
          <OutletModeScreen
            tenantName={tenantName}
            tenant={tenant}
            logoUrl={logoUrl}
            promoImageUrl={promoImageUrl}
            promoHeadline={promoHeadline}
            modes={modes}
            message={message}
            onSelect={setMode}
            welcome={welcome}
            onStartOrdering={() => setHasStarted(true)}
          />
        ) : (
          <OutletPickerScreen
            mode={pickerMode}
            ranked={rankFor(pickerMode).outlets}
            isLocating={isLocating}
            onLocate={onLocate}
            onBack={
              showTiles
                ? isModeForced
                  ? null
                  : () => setMode(null)
                : () => setHasStarted(false)
            }
            onSelect={(outletId) => onSelect(outletId, pickerMode)}
            now={now}
          />
        )}
      </div>
    </div>
  )
}
