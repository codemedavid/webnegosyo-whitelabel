'use client'

import { useState } from 'react'
import { BadgeCheck, X } from 'lucide-react'
import type { CheckoutGovClaimState } from '@/hooks/checkout/use-checkout-gov-claim'
import type { GovDiscountKind } from '@/lib/gov-discount'

interface GovClaimFieldProps {
  state: CheckoutGovClaimState
  formatPrice: (amount: number) => string
  /** The tenant's accent, so the field sits in any storefront palette. */
  accent: string
}

/**
 * "Senior Citizen or PWD?" at online checkout (JMC 01-2022): the customer
 * declares their status and ID number now and shows the card on pickup or
 * delivery. Collapsed by default — most customers never open it — and shown
 * only when the store has set up Senior/PWD discounts.
 */
export function GovClaimField({ state, formatPrice, accent }: GovClaimFieldProps) {
  const { govSetup, govClaim, govPreview, isCheckingGov, applyGovClaim, removeGovClaim } = state
  const [isOpen, setIsOpen] = useState(false)
  const [kind, setKind] = useState<GovDiscountKind>('senior')
  const [name, setName] = useState('')
  const [idNumber, setIdNumber] = useState('')

  if (!govSetup || govSetup.kinds.length === 0) return null
  const selected = govSetup.kinds.find((entry) => entry.kind === kind) ?? govSetup.kinds[0]
  const canApply = name.trim().length >= 2 && idNumber.trim().length >= 3 && !isCheckingGov

  if (govClaim) {
    const rule = govSetup.kinds.find((entry) => entry.kind === govClaim.kind)
    return (
      <div className="space-y-1 rounded-md border border-gray-200 p-3 text-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accent }} aria-hidden />
            <div className="min-w-0">
              <p className="font-medium">
                {rule?.label ?? 'Senior/PWD'} · {govClaim.name}
              </p>
              {isCheckingGov && <p className="text-gray-500">Checking the discount…</p>}
              {govPreview?.status === 'applied' && (
                <p className="text-green-700">−{formatPrice(govPreview.reduction)} · show your ID on {pickupWord()}</p>
              )}
              {govPreview?.status === 'outranked' && (
                <p className="text-gray-600">
                  Your voucher saves more ({formatPrice(govPreview.otherReduction)}), so it applies instead — the law
                  allows one or the other.
                </p>
              )}
              {govPreview?.status === 'refused' && <p className="text-red-600">{govPreview.message}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={removeGovClaim}
            aria-label="Remove Senior/PWD discount"
            className="shrink-0 rounded p-1 text-gray-500 hover:text-gray-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="min-h-11 text-left text-sm font-medium underline underline-offset-4"
        style={{ color: accent }}
      >
        Senior Citizen or PWD? Get your discount
      </button>
    )
  }

  return (
    <fieldset className="space-y-3 rounded-md border border-gray-200 p-3">
      <legend className="px-1 text-sm font-medium">Senior Citizen / PWD discount</legend>

      {govSetup.kinds.length > 1 && (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Discount type">
          {govSetup.kinds.map((entry) => {
            const isActive = entry.kind === kind
            return (
              <button
                key={entry.kind}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => setKind(entry.kind)}
                className="min-h-10 rounded-full border px-3 text-sm font-medium"
                style={isActive ? { borderColor: accent, color: accent } : undefined}
              >
                {entry.label}
              </button>
            )
          })}
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor="gov-claim-name" className="text-sm">Name on the ID</label>
        <input
          id="gov-claim-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="gov-claim-id" className="text-sm">{selected.idLabel}</label>
        <input
          id="gov-claim-id"
          value={idNumber}
          onChange={(event) => setIdNumber(event.target.value.toUpperCase())}
          placeholder={selected.idPlaceholder}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="h-10 w-full rounded-md border border-gray-300 px-3 font-mono text-sm uppercase"
        />
      </div>

      <p className="text-xs text-gray-600">
        For your own order. Please show the original ID when you receive it — without it the store may charge the
        regular price.
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!canApply}
          onClick={() => void applyGovClaim({ kind: selected.kind, name: name.trim(), idNumber: idNumber.trim() })}
          className="h-10 flex-1 rounded-md px-4 text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: accent }}
        >
          {isCheckingGov ? 'Checking…' : 'Apply discount'}
        </button>
        <button type="button" onClick={() => setIsOpen(false)} className="h-10 rounded-md border border-gray-300 px-4 text-sm">
          Cancel
        </button>
      </div>
    </fieldset>
  )
}

function pickupWord(): string {
  return 'pickup or delivery'
}
