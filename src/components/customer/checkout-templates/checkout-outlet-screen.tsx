'use client'

/**
 * "Which branch?" as its own screen, on the checkout-timing path.
 *
 * Deliberately the SAME `OutletPickerScreen` the pre-menu splash uses, so a
 * customer meets one branch screen whichever timing the merchant picked — the
 * cards, the search, the open/closed labels and the distance badges all come
 * from that one component rather than a second look-alike.
 *
 * It takes over the checkout route until the question is answered. There is no
 * back step and no locate button: the order type was already chosen on the form
 * behind it, and geolocation belongs to the splash flow where the customer has
 * not committed to anything yet.
 *
 * Two states this screen must handle that the splash never does, because the
 * splash owns its own data and this one is handed it mid-flight: the list is
 * still loading, and no branch can serve the order type the customer already
 * picked. Both used to leave the customer looking at an empty picker.
 */

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { OutletPickerScreen, type PickerOutlet } from '@/components/customer/outlet-picker-screen'
import { OUTLET_MODE_LABELS } from '@/lib/outlets/outlet-modes'
import type { RankedOutlet } from '@/lib/outlets/nearest-outlet'
import type { UseCheckoutOutletResult } from '@/hooks/use-checkout-outlet'

interface CheckoutOutletScreenProps {
  outlet: UseCheckoutOutletResult
}

const DROPPED_MESSAGE = 'That branch no longer offers this order type. Please pick another.'

export function CheckoutOutletScreen({ outlet }: CheckoutOutletScreenProps) {
  /**
   * One clock reading for the life of the screen.
   *
   * This renders inside a client page that Next.js still renders on the server,
   * so a `new Date()` taken during render is taken twice — once per side of the
   * hydration boundary — and a branch sitting near its closing time can be
   * labelled "Open" in the server HTML and "Closed" a moment later in the
   * browser. Freezing it in state on mount is the same rule the splash follows.
   */
  const [now] = useState(() => new Date())

  if (!outlet.isMissingRequiredSelection) return null

  if (outlet.isLoading) {
    return (
      <CheckoutOutletMessage>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Loading branches…</p>
      </CheckoutOutletMessage>
    )
  }

  // Nothing can take this order. Naming the order type is what makes the way
  // out obvious — the customer changes it on the form they came from.
  if (outlet.choices.length === 0) {
    const modeLabel = outlet.mode ? OUTLET_MODE_LABELS[outlet.mode].toLowerCase() : 'this'
    return (
      <CheckoutOutletMessage>
        <h1 className="text-lg font-semibold">No branch can take this order</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          None of our branches are set up for {modeLabel} orders right now. Please go back and
          choose a different order type.
        </p>
      </CheckoutOutletMessage>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <OutletPickerScreen
        mode={outlet.mode}
        ranked={outlet.choices as unknown as RankedOutlet<PickerOutlet>[]}
        isLocating={false}
        onLocate={null}
        onBack={null}
        notice={outlet.droppedReason === 'order-type-changed' ? DROPPED_MESSAGE : null}
        onSelect={outlet.select}
        now={now}
      />
    </div>
  )
}

function CheckoutOutletMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      {children}
    </div>
  )
}
