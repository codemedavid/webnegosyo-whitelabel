'use client'

/**
 * The voucher block's field in its two designs. The block is required (a
 * design must never hide a store's codes), so "tucked away" only folds the
 * box behind a link: one tap opens it, and it stays open whenever a code is
 * already on the order. Both designs are the shared VoucherField with the
 * hook's own apply / remove handlers.
 */

import { TicketPercent } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import { formatPrice } from '@/lib/cart-utils'
import type { VoucherDesign } from '@/lib/page-designer/checkout-block-options'
import { VoucherField } from '@/components/customer/checkout-templates/voucher-field'

interface VoucherBlockFieldProps {
  checkout: UseCheckoutReturn
  label: string
  design: VoucherDesign
}

export function VoucherBlockField({ checkout, label, design }: VoucherBlockFieldProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [shouldFocus, setShouldFocus] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const isShown = design === 'field' || isOpen || checkout.voucherCodes.length > 0

  // Opening by tap puts the cursor in the code box, so the keyboard comes up.
  useEffect(() => {
    if (!shouldFocus) return
    boxRef.current?.querySelector('input')?.focus()
    setShouldFocus(false)
  }, [shouldFocus])

  if (!isShown) {
    return (
      <button
        type="button"
        aria-expanded={false}
        data-part="link"
        onClick={() => {
          setIsOpen(true)
          setShouldFocus(true)
        }}
        className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-semibold text-[color:var(--co-accent)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--co-accent)]"
      >
        <TicketPercent className="h-4 w-4 shrink-0" aria-hidden="true" />
        {label}
      </button>
    )
  }

  const field = (
    <VoucherField
      codes={checkout.voucherCodes}
      preview={checkout.voucherPreview}
      isChecking={checkout.isCheckingVoucher}
      onApply={checkout.applyVoucherCode}
      onRemove={checkout.removeVoucherCode}
      formatPrice={formatPrice}
      lineNames={checkout.voucherLineNames}
      onChooseUnits={checkout.setVoucherUnitPicks}
      label={label}
    />
  )
  // The open design is today's markup, untouched.
  return design === 'field' ? field : <div ref={boxRef}>{field}</div>
}
