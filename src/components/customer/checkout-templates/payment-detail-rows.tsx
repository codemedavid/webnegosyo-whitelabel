'use client'

/**
 * Copyable payment-detail rows.
 *
 * One row per merchant-entered line ("GCash: 0917 123 4567"). The whole row
 * is the tap target; the copy button copies only the value. Shared by the
 * inline method selector and the payment-details dialog so both read alike.
 */

import { Check, Copy } from 'lucide-react'
import type { PaymentDetailRow } from '@/lib/payment-details-lines'

interface PaymentDetailRowsProps {
  rows: PaymentDetailRow[]
  copiedText: string | null
  onCopy: (value: string, label: string) => void
  /** Brand accent used for the copied tick. */
  accent: string
}

export function PaymentDetailRows({ rows, copiedText, onCopy, accent }: PaymentDetailRowsProps) {
  if (rows.length === 0) return null

  return (
    <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
      {rows.map((row, index) => {
        const isCopied = copiedText === row.value
        const copyLabel = row.label ?? 'Details'
        return (
          <li key={`${row.value}-${index}`}>
            <button
              type="button"
              onClick={() => onCopy(row.value, copyLabel)}
              aria-label={`Copy ${copyLabel}`}
              className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--checkout-accent)]"
              style={{ ['--checkout-accent' as string]: accent }}
            >
              <span className="min-w-0 flex-1">
                {row.label && (
                  <span className="block text-[11px] font-medium uppercase tracking-wide text-gray-500">
                    {row.label}
                  </span>
                )}
                <span className="block break-all text-[15px] font-medium leading-snug text-gray-900 tabular-nums">
                  {row.value}
                </span>
              </span>
              <span
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors"
                style={
                  isCopied
                    ? { borderColor: accent, color: accent, backgroundColor: 'transparent' }
                    : { borderColor: '#e5e7eb', color: '#4b5563' }
                }
              >
                {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {isCopied ? 'Copied' : 'Copy'}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
