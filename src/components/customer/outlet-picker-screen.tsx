'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, Crosshair, MapPin, Search, Store } from 'lucide-react'
import { buildOutletCard, filterOutletsByQuery } from '@/lib/outlets/outlet-card'
import { OUTLET_MODE_LABELS } from '@/lib/outlets/outlet-modes'
import type { OutletOrderMode, RankedOutlet } from '@/lib/outlets/nearest-outlet'
import type { SelectableOutlet } from '@/lib/outlets/outlet-selection'

/** The branch fields this screen renders beyond what selection needs. */
export interface PickerOutlet extends SelectableOutlet {
  address: string | null
  image_url: string | null
  operating_hours: unknown
  timezone: string | null
}

interface OutletPickerScreenProps {
  mode: OutletOrderMode
  ranked: RankedOutlet<PickerOutlet>[]
  isLocating: boolean
  onLocate: () => void
  /** Null when the mode was forced (one mode on offer) and there is no step back. */
  onBack: (() => void) | null
  onSelect: (outletId: string) => void
  /** Injected so the open/closed label is decided once, not per render tick. */
  now: Date
}

/**
 * Second screen: which branch?
 *
 * Every claim on a card comes from `buildOutletCard`, which is where the
 * degradation rules live — a branch with no hours reads as open, a branch with
 * no address loses its direction link rather than offering a dead one. This
 * component only lays them out.
 *
 * Search covers name and address together because a customer usually knows
 * where they are rather than what the merchant named the branch.
 */
export function OutletPickerScreen({
  mode,
  ranked,
  isLocating,
  onLocate,
  onBack,
  onSelect,
  now,
}: OutletPickerScreenProps) {
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    const matches = filterOutletsByQuery(
      ranked.map((entry) => entry.outlet),
      query
    )
    const allowed = new Set(matches.map((outlet) => outlet.id))
    return ranked.filter((entry) => allowed.has(entry.outlet.id))
  }, [ranked, query])

  return (
    <div className="flex min-h-full w-full flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-3 py-3 backdrop-blur">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to order type"
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        ) : (
          <span className="h-10 w-10" aria-hidden />
        )}
        <h1 className="flex-1 text-center text-lg font-semibold">Select Your Outlet</h1>
        <button
          type="button"
          onClick={onLocate}
          disabled={isLocating}
          aria-label="Use my location"
          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted disabled:opacity-50"
        >
          <Crosshair className={`h-6 w-6 ${isLocating ? 'animate-pulse' : ''}`} />
        </button>
      </header>

      <div className="px-4 py-4">
        <label className="relative block">
          <span className="sr-only">Search for a branch</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search for a branch"
            className="w-full rounded-full bg-muted py-3.5 pl-12 pr-4 text-base outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
        <p className="mt-2 px-1 text-xs text-muted-foreground">
          Showing branches for {OUTLET_MODE_LABELS[mode].toLowerCase()}
        </p>
      </div>

      <div className="flex-1 space-y-5 px-4 pb-10">
        {visible.map(({ outlet, distanceKm, withinDeliveryRadius }) => {
          const card = buildOutletCard(
            {
              id: outlet.id,
              slug: outlet.slug,
              name: outlet.name,
              address: outlet.address,
              image_url: outlet.image_url,
              latitude: outlet.latitude,
              longitude: outlet.longitude,
              operating_hours: outlet.operating_hours,
              timezone: outlet.timezone,
            },
            now
          )
          const outOfRange = mode === 'delivery' && !withinDeliveryRadius

          return (
            <div key={outlet.id} className="space-y-2">
              <button
                type="button"
                onClick={() => onSelect(outlet.id)}
                disabled={outOfRange}
                className="block w-full overflow-hidden rounded-2xl text-left transition-opacity disabled:opacity-50"
              >
                {outlet.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={outlet.image_url}
                    alt={outlet.name}
                    className="h-44 w-full rounded-2xl object-cover"
                  />
                ) : (
                  <span className="flex h-44 w-full items-center justify-center rounded-2xl bg-muted">
                    <Store className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
                  </span>
                )}
                <span className="mt-3 block text-base font-bold">{outlet.name}</span>
              </button>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className={card.isOpen ? 'font-medium text-emerald-600' : 'font-medium text-muted-foreground'}>
                  {card.isOpen ? 'Open' : 'Closed'}
                </span>
                {card.isOpen && card.closesAt && (
                  <>
                    <span className="text-muted-foreground">|</span>
                    <span className="text-muted-foreground">Closes {card.closesAt}</span>
                  </>
                )}
                {!card.isOpen && card.nextOpenLabel && (
                  <>
                    <span className="text-muted-foreground">|</span>
                    <span className="text-muted-foreground">Opens {card.nextOpenLabel}</span>
                  </>
                )}
                {card.directionsUrl && (
                  <a
                    href={card.directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto underline underline-offset-2"
                  >
                    Get Direction
                  </a>
                )}
              </div>

              {outlet.address && (
                <p className="flex items-start gap-2 text-sm text-muted-foreground">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{outlet.address}</span>
                </p>
              )}

              {distanceKm !== null && (
                <p className="text-sm text-muted-foreground">{distanceKm.toFixed(1)} km away</p>
              )}

              {outOfRange && (
                <p className="text-sm text-amber-600">Outside this branch&apos;s delivery area</p>
              )}
            </div>
          )
        })}

        {visible.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {query.trim()
              ? `No branches match “${query.trim()}”.`
              : 'No branches offer this option right now.'}
          </p>
        )}
      </div>
    </div>
  )
}
