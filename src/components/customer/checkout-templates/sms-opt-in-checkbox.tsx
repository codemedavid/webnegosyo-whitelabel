'use client'

import { useId } from 'react'

import { getCheckoutPalette } from '@/lib/branding-utils'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'

import { CO, checkoutThemeStyle } from './checkout-theme'

/**
 * Permission to text this customer later.
 *
 * Unticked by default and never pre-checked: a pre-ticked box is not consent,
 * and this is the record the merchant would rely on if a recipient ever
 * complained. The value bypasses `customerData` entirely — that map is
 * `Record<string, string>`, and a string "true" is rejected by both consent
 * read sites, so routing it through the normal field path would look like it
 * worked while quietly collecting nothing.
 */
export function SmsOptInCheckbox({ checkout, label }: { checkout: UseCheckoutReturn; label?: string }) {
  const { isSmsOptedIn, setIsSmsOptedIn, tenant } = checkout
  const { accent } = getCheckoutPalette(checkout.tenant, checkout.branding)
  const id = useId()

  return (
    <label
      htmlFor={id}
      className={`mt-4 flex cursor-pointer items-start gap-2.5 text-sm ${CO.muted}`}
      style={checkoutThemeStyle(checkout)}
    >
      <input
        id={id}
        type="checkbox"
        checked={isSmsOptedIn}
        onChange={(e) => setIsSmsOptedIn(e.target.checked)}
        className={`mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded ${CO.border}`}
        style={{ accentColor: accent }}
      />
      {label ? (
        <span data-part="text">{label}</span>
      ) : (
        <span data-part="text">
          Text me updates and offers from {tenant?.name ?? 'this store'}. Standard message rates apply,
          and you can opt out any time.
        </span>
      )}
    </label>
  )
}
