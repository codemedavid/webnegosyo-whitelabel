'use client'

import { useEffect, useState } from 'react'
import { MapPin, Navigation } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { OutletOrderMode, RankedOutlet } from '@/lib/outlets/nearest-outlet'
import type { SelectableOutlet } from '@/lib/outlets/outlet-selection'

interface OutletSplashProps {
  tenantName: string
  /** Optional promo image shown above the choices; absent renders no gap. */
  promoImageUrl?: string | null
  promoHeadline?: string | null
  supportsPickup: boolean
  supportsDelivery: boolean
  /** Why we are asking — drives the explanatory line, if any. */
  reason: string | null
  isLocating: boolean
  onLocate: () => void
  rankFor: (mode: OutletOrderMode) => { outlets: RankedOutlet<SelectableOutlet>[] }
  onSelect: (outletId: string, mode: OutletOrderMode) => void
}

const REASON_MESSAGE: Record<string, string> = {
  'unknown-link': 'That branch link is no longer available — please pick a branch.',
  'outlet-unavailable': 'The branch you chose last time is closed. Please pick another.',
  'mode-unsupported': 'Your usual branch no longer offers that option. Please choose again.',
}

/**
 * Full-screen branch chooser, shown only when the tenant has two or more active
 * branches and the customer has not already chosen one. Handing off to the
 * existing menu unchanged is the whole point — this never wraps or replaces it.
 */
export function OutletSplash({
  tenantName,
  promoImageUrl,
  promoHeadline,
  supportsPickup,
  supportsDelivery,
  reason,
  isLocating,
  onLocate,
  rankFor,
  onSelect,
}: OutletSplashProps) {
  const [mode, setMode] = useState<OutletOrderMode>(supportsPickup ? 'pickup' : 'delivery')

  // Offer to locate once, in the background. The list is already usable.
  useEffect(() => {
    onLocate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ranked = rankFor(mode).outlets
  const message = reason ? REASON_MESSAGE[reason] : null
  const showModeToggle = supportsPickup && supportsDelivery

  return (
    <div className="fixed inset-0 z-[110] overflow-y-auto bg-background">
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col gap-6 px-5 py-8">
        {promoImageUrl && (
          <div className="overflow-hidden rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={promoImageUrl} alt={promoHeadline ?? ''} className="w-full object-cover" />
          </div>
        )}

        <div>
          <h1 className="text-2xl font-bold">{promoHeadline || `Welcome to ${tenantName}`}</h1>
          <p className="text-muted-foreground">Choose a branch to start your order.</p>
          {message && <p className="mt-2 text-sm text-amber-600">{message}</p>}
        </div>

        {showModeToggle && (
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
            {(['pickup', 'delivery'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMode(option)}
                className={`rounded-lg px-4 py-2.5 text-sm font-medium capitalize transition-colors ${
                  mode === option ? 'bg-background shadow-sm' : 'text-muted-foreground'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">
            {ranked.length} {ranked.length === 1 ? 'branch' : 'branches'}
          </span>
          <Button variant="ghost" size="sm" onClick={onLocate} disabled={isLocating}>
            <Navigation className="mr-2 h-4 w-4" />
            {isLocating ? 'Locating…' : 'Use my location'}
          </Button>
        </div>

        <div className="space-y-3">
          {ranked.map(({ outlet, distanceKm, withinDeliveryRadius }) => {
            const outOfRange = mode === 'delivery' && !withinDeliveryRadius
            return (
              <button
                key={outlet.id}
                type="button"
                onClick={() => onSelect(outlet.id, mode)}
                disabled={outOfRange}
                className="flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors enabled:hover:border-primary disabled:opacity-50"
              >
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{outlet.name}</span>
                  {distanceKm !== null && (
                    <span className="block text-sm text-muted-foreground">
                      {distanceKm.toFixed(1)} km away
                    </span>
                  )}
                  {outOfRange && (
                    <span className="block text-sm text-amber-600">
                      Outside this branch&apos;s delivery area
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>

        {mode === 'delivery' && ranked.every((entry) => !entry.withinDeliveryRadius) && (
          <p className="text-sm text-muted-foreground">
            None of our branches deliver to your area yet. Switch to pickup, or choose a branch to
            see its menu.
          </p>
        )}
      </div>
    </div>
  )
}
