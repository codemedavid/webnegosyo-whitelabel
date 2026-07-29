'use client'

/**
 * "Which branch?" — asked at checkout, for the merchants who chose that timing.
 *
 * Lives beside the other shared checkout pieces and is rendered by the page
 * shell rather than by each design, so all five checkout designs get the same
 * question without five copies of it. Deliberately unstyled beyond the neutral
 * card the shell already uses: a design that re-skins the form around it still
 * reads as one page.
 *
 * Renders nothing at all unless the hook says there is a question to ask, which
 * is what keeps every other tenant's checkout byte-identical to today's.
 */

import { MapPin } from 'lucide-react'
import type { UseCheckoutOutletResult } from '@/hooks/use-checkout-outlet'

interface CheckoutOutletSectionProps {
  outlet: UseCheckoutOutletResult
}

export function CheckoutOutletSection({ outlet }: CheckoutOutletSectionProps) {
  if (!outlet.isPickerVisible) return null

  return (
    <div className="space-y-3" data-branding-scope="checkout/colors">
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-gray-500" aria-hidden="true" />
        <h2 className="font-semibold text-gray-900">Which branch?</h2>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {outlet.choices.map(({ outlet: branch }) => {
          const isChosen = branch.id === outlet.selectedOutletId
          return (
            <button
              key={branch.id}
              type="button"
              aria-pressed={isChosen}
              onClick={() => outlet.select(branch.id)}
              className={`rounded-lg border p-3 text-left transition-colors ${
                isChosen
                  ? 'border-orange-500 bg-orange-50 ring-1 ring-orange-500'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <span className="block font-medium text-gray-900">{branch.name}</span>
              {branch.address && (
                <span className="block text-sm text-gray-500">{branch.address}</span>
              )}
            </button>
          )
        })}
      </div>

      {outlet.isMissingRequiredSelection && (
        <p className="text-sm text-gray-500">Pick a branch to place your order.</p>
      )}
    </div>
  )
}
