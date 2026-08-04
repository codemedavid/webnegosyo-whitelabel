'use client'

import { Button } from '@/components/ui/button'
import type { Voucher } from '@/lib/vouchers/types'

interface VoucherCardProps {
  voucher: Voucher
  onEdit: () => void
  onToggleActive: () => void
}

/** "50% off, up to ₱200" — the shape of the deal, in one line. */
function describeDiscount(voucher: Voucher): string {
  if (voucher.discountType === 'free_delivery') return 'Free delivery'
  if (voucher.discountType === 'fixed') return `₱${voucher.discountValue} off`

  const cap = voucher.maxDiscountAmount ? `, up to ₱${voucher.maxDiscountAmount}` : ''
  return `${voucher.discountValue}% off${cap}`
}

function describeScope(voucher: Voucher): string {
  if (voucher.scope === 'universal') return 'Whole order'
  const count = voucher.targetIds?.length ?? 0
  const noun = voucher.scope === 'categories' ? 'category' : 'product'
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

/**
 * Remaining uses, or null when unlimited. Shown because a code that has
 * quietly run out looks identical to a live one otherwise.
 */
function remainingUses(voucher: Voucher): number | null {
  if (voucher.usageLimitTotal == null) return null
  return Math.max(0, voucher.usageLimitTotal - voucher.usedCount)
}

export function VoucherCard({ voucher, onEdit, onToggleActive }: VoucherCardProps) {
  const remaining = remainingUses(voucher)
  const isExhausted = remaining === 0

  return (
    <div
      className={`rounded-lg border p-4 ${
        voucher.isActive ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            className={`font-mono font-semibold truncate ${
              voucher.isActive ? 'text-gray-900' : 'text-gray-500'
            }`}
          >
            {voucher.code}
          </p>
          <p className="text-sm text-gray-600 truncate">{voucher.name}</p>
        </div>

        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            !voucher.isActive
              ? 'bg-gray-200 text-gray-700'
              : isExhausted
                ? 'bg-amber-100 text-amber-800'
                : 'bg-green-100 text-green-800'
          }`}
        >
          {!voucher.isActive ? 'Retired' : isExhausted ? 'Used up' : 'Live'}
        </span>
      </div>

      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-gray-500">Discount</dt>
          <dd className="text-gray-900 text-right">{describeDiscount(voucher)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-gray-500">Applies to</dt>
          <dd className="text-gray-900 text-right">{describeScope(voucher)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-gray-500">Used</dt>
          <dd className="text-gray-900 text-right">
            {voucher.usedCount}
            {remaining !== null && ` of ${voucher.usageLimitTotal}`}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-gray-500">Stacking</dt>
          <dd className="text-gray-900 text-right">
            {voucher.isStackable ? 'Can combine' : 'On its own'}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="ghost" size="sm" className="flex-1" onClick={onToggleActive}>
          {voucher.isActive ? 'Retire' : 'Reactivate'}
        </Button>
      </div>
    </div>
  )
}
