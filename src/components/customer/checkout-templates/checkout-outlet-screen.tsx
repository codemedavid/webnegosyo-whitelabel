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
 */

import { OutletPickerScreen, type PickerOutlet } from '@/components/customer/outlet-picker-screen'
import type { RankedOutlet } from '@/lib/outlets/nearest-outlet'
import type { UseCheckoutOutletResult } from '@/hooks/use-checkout-outlet'

interface CheckoutOutletScreenProps {
  outlet: UseCheckoutOutletResult
}

export function CheckoutOutletScreen({ outlet }: CheckoutOutletScreenProps) {
  if (!outlet.isMissingRequiredSelection) return null

  return (
    <div className="min-h-screen bg-background">
      <OutletPickerScreen
        mode={outlet.mode}
        ranked={outlet.choices as unknown as RankedOutlet<PickerOutlet>[]}
        isLocating={false}
        onLocate={() => {}}
        onBack={null}
        onSelect={outlet.select}
        now={new Date()}
      />
    </div>
  )
}
