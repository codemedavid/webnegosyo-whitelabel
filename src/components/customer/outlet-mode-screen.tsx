'use client'

import { Bike, ShoppingBag, UtensilsCrossed } from 'lucide-react'
import type { OutletOrderMode } from '@/lib/outlets/nearest-outlet'
import { OUTLET_MODE_LABELS } from '@/lib/outlets/outlet-modes'

interface OutletModeScreenProps {
  tenantName: string
  /** Optional promo image shown above the choices; absent renders no gap. */
  promoImageUrl?: string | null
  promoHeadline?: string | null
  /** Only the modes at least one branch can actually fulfill. */
  modes: readonly OutletOrderMode[]
  /** Why we are asking again — drives the explanatory line, if any. */
  message?: string | null
  onSelect: (mode: OutletOrderMode) => void
}

const MODE_ICONS: Record<OutletOrderMode, typeof Bike> = {
  dine_in: UtensilsCrossed,
  pickup: ShoppingBag,
  delivery: Bike,
}

const MODE_BLURBS: Record<OutletOrderMode, string> = {
  dine_in: 'Eat with us',
  pickup: 'Collect in store',
  delivery: 'Straight to you',
}

/**
 * First screen of the branch flow: how does the customer want their order?
 *
 * Mode comes before branch because it is the question that narrows the other —
 * asking for a branch first would list branches the customer's chosen mode
 * cannot use, and then have to explain why half of them are greyed out.
 *
 * Tiles render in a fixed order and only for modes a branch actually supports,
 * so a merchant with no seating never shows a Dine In tile that leads nowhere.
 */
export function OutletModeScreen({
  tenantName,
  promoImageUrl,
  promoHeadline,
  modes,
  message,
  onSelect,
}: OutletModeScreenProps) {
  return (
    <div className="flex min-h-full w-full flex-col gap-7 px-5 py-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {promoHeadline || `Welcome to ${tenantName}`}
        </h1>
        <p className="mt-1 text-muted-foreground">How would you like your order?</p>
        {message && <p className="mt-2 text-sm text-amber-600">{message}</p>}
      </div>

      {promoImageUrl && (
        <div className="overflow-hidden rounded-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={promoImageUrl} alt={promoHeadline ?? ''} className="w-full object-cover" />
        </div>
      )}

      <div
        className={`grid gap-4 ${modes.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} ${
          modes.length === 3 ? 'sm:grid-cols-3' : ''
        }`}
      >
        {modes.map((mode) => {
          const Icon = MODE_ICONS[mode]
          return (
            <button
              key={mode}
              type="button"
              onClick={() => onSelect(mode)}
              className="group flex flex-col items-center gap-3 rounded-2xl border-2 border-transparent bg-muted/60 px-4 py-7 transition-colors hover:border-primary hover:bg-muted"
            >
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-background shadow-sm">
                <Icon className="h-9 w-9 text-primary" strokeWidth={1.75} />
              </span>
              <span className="text-center">
                <span className="block text-base font-bold uppercase tracking-wide">
                  {OUTLET_MODE_LABELS[mode]}
                </span>
                <span className="block text-xs text-muted-foreground">{MODE_BLURBS[mode]}</span>
              </span>
            </button>
          )
        })}
      </div>

      {modes.length === 0 && (
        <p className="text-sm text-muted-foreground">
          None of our branches are taking orders right now. Please check back shortly.
        </p>
      )}
    </div>
  )
}
