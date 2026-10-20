'use client'

/**
 * The Senior/PWD part of an order, for the admin's order surfaces: who claimed
 * it, their share and what came off, and — at a VAT store — the VAT block the
 * receipt prints. Its money is already in the discount rows above; this says
 * WHO and WHY.
 *
 * ID numbers are masked until someone asks: the order screen is read over a
 * counter, and the full number is on the paper and in the review screens.
 * The rows come from `govOrderSummary`, shared with the register's order
 * screen and the receipt, so the three never name different figures.
 */

import { useState } from 'react'
import { BadgePercent, Eye, EyeOff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/cart-utils'
import type { OrderDiscountPayload } from '@/lib/order-discount'
import { govOrderSummary } from '@/lib/order-gov-summary'

interface GovDiscountSummaryProps {
  discount: OrderDiscountPayload | null
  /** `compact`: one line per claimant, for an order card. */
  variant?: 'full' | 'compact'
}

export function GovDiscountSummary({ discount, variant = 'full' }: GovDiscountSummaryProps) {
  const [isIdShown, setIsIdShown] = useState(false)
  const summary = govOrderSummary(discount?.government)
  if (!summary) return null

  if (variant === 'compact') {
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {summary.claimants.map((claimant) => (
          <Badge key={claimant.id} variant="outline" className="gap-1 font-medium">
            <span className="font-bold">{claimant.code}</span>
            <span className="max-w-[10rem] truncate">{claimant.name}</span>
          </Badge>
        ))}
      </div>
    )
  }

  const IdIcon = isIdShown ? EyeOff : Eye

  return (
    <section aria-label="Senior and PWD discount" className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold">
          <BadgePercent className="h-4 w-4" aria-hidden />
          Senior / PWD
        </h4>
        <button
          type="button"
          onClick={() => setIsIdShown((shown) => !shown)}
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          aria-pressed={isIdShown}
        >
          <IdIcon className="h-3.5 w-3.5" aria-hidden />
          {isIdShown ? 'Hide ID numbers' : 'Show ID numbers'}
        </button>
      </div>

      <ul className="space-y-2">
        {summary.claimants.map((claimant) => (
          <li key={claimant.id} className="flex items-start justify-between gap-3 text-sm">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="shrink-0 px-1.5 text-[11px] font-bold">
                  {claimant.code}
                </Badge>
                <span className="truncate font-medium">{claimant.name}</span>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                ID {isIdShown ? claimant.idNumber : claimant.maskedId} · {claimant.basis}
              </div>
            </div>
            <div className="shrink-0 text-right text-xs">
              <div className="text-muted-foreground">Share {formatPrice(claimant.share)}</div>
              <div className="font-medium text-emerald-600 dark:text-emerald-400">
                −{formatPrice(claimant.reduction)}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {summary.vatRows.length > 0 && (
        <dl className="space-y-1 border-t pt-3 text-xs">
          {summary.vatRows.map((row) => (
            <div key={row.kind} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="font-medium tabular-nums">
                {row.kind === 'lessDiscount' ? '−' : ''}
                {formatPrice(row.amount)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {summary.approverName && (
        <p className="text-xs text-muted-foreground">Approved by {summary.approverName}</p>
      )}
    </section>
  )
}
