'use client'

/**
 * The payment chooser in the designs a Page Designer checkout can pick. Only
 * the chooser changes: every design is the same radio group over the same
 * `paymentMethods` / `setSelectedPaymentMethod`, and the chosen method opens
 * the same ticket (QR, copyable details, proof note) as PaymentMethodList.
 * `wallet` IS PaymentMethodList (the standard checkouts' look). The v3
 * designs (chosen + Change, accordion, pay now / later) live in
 * payment-choices-more.tsx and reuse these rows and the same ticket.
 */

import { Check } from 'lucide-react'
import type { ReactNode } from 'react'

import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import { getCheckoutPalette } from '@/lib/branding-utils'
import { cornersClass, type CornersChoice } from '@/lib/page-designer/knobs'
import type { PaymentDesign } from '@/lib/page-designer/checkout-block-options'

import { checkoutThemeStyle } from './checkout-theme'
import { MoreHowToPay, isMorePaymentDesign, type SplitLabels } from './payment-choices-more'
import { FOCUS_RING, Radio, Row, surface, type ChoiceProps } from './payment-choice-parts'
import { MethodMark, NoPaymentMethods, PaymentMethodList, PaymentTicket, SHOW_ALL_PAYMENT_PARTS, type PaymentShow } from './payment-method-list'

export interface PaymentLook {
  design: PaymentDesign
  corners: CornersChoice
  /** Parts to leave out; absent = everything (today's picker). */
  show?: PaymentShow
  /** The pay now / later choices' names (split design). */
  splitLabels?: Partial<SplitLabels>
}

function GridTile({ method, isSelected, corners, show = SHOW_ALL_PAYMENT_PARTS, onSelect }: ChoiceProps) {
  return (
    <label
      data-branding-scope="checkout/choice"
      data-part="option"
      data-on={isSelected ? '' : undefined}
      className={`relative flex min-h-28 w-full cursor-pointer flex-col items-center justify-center gap-2 border-2 px-2 py-3 text-center transition-[border-color,background-color] ${cornersClass(corners, 'rounded-2xl')} ${FOCUS_RING} ${surface(isSelected)}`}
    >
      <Radio method={method} isSelected={isSelected} onSelect={onSelect} />
      {isSelected && (
        <span aria-hidden="true" data-part="tick" className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--co-accent)] text-[color:var(--co-accent-text)]">
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      )}
      {show.icons && <MethodMark method={method} accent="var(--co-accent)" accentSoft="var(--co-accent-soft)" />}
      <span data-part="option-label" className="line-clamp-2 w-full text-[13px] font-semibold leading-tight text-[color:var(--co-text)]">{method.name}</span>
    </label>
  )
}

/** How the methods sit: two or three across, or one per row. */
const LAYOUT: Record<'grid' | 'rows', { Choice: (props: ChoiceProps) => ReactNode; wrap: string }> = {
  grid: { Choice: GridTile, wrap: 'grid grid-cols-2 gap-3 sm:grid-cols-3' },
  rows: { Choice: Row, wrap: 'flex flex-col gap-2' },
}

/** The payment chooser in the block's design (absent look = the standard wallet). */
export function PaymentChoices({ checkout, look }: { checkout: UseCheckoutReturn; look?: PaymentLook }) {
  const { paymentMethods, selectedPaymentMethod, setSelectedPaymentMethod, openQrDialog, handleCopyText, copiedText, orderType, tenant, branding } = checkout
  if (!look || look.design === 'wallet') return <PaymentMethodList checkout={checkout} corners={look?.corners} show={look?.show} />

  if (paymentMethods.length === 0) {
    if (!orderType || !tenant) return null
    return (
      <div style={checkoutThemeStyle(checkout)}>
        <NoPaymentMethods />
      </div>
    )
  }

  if (isMorePaymentDesign(look.design)) {
    return (
      <fieldset className="min-w-0" data-payment-methods style={checkoutThemeStyle(checkout)}>
        <legend className="sr-only">Payment method</legend>
        <MoreHowToPay checkout={checkout} look={look} design={look.design} />
      </fieldset>
    )
  }

  const { accent } = getCheckoutPalette(tenant, branding)
  const selected = paymentMethods.find((m) => m.id === selectedPaymentMethod) ?? null
  const show = look.show ?? SHOW_ALL_PAYMENT_PARTS
  const { Choice, wrap } = LAYOUT[look.design]
  return (
    // `data-payment-methods`: the hook scrolls here when a customer proceeds without choosing.
    <fieldset className="min-w-0" data-payment-methods style={checkoutThemeStyle(checkout)}>
      <legend className="sr-only">Payment method</legend>
      <div className={wrap}>
        {paymentMethods.map((method) => (
          <Choice
            key={method.id}
            method={method}
            isSelected={method.id === selectedPaymentMethod}
            corners={look.corners}
            show={show}
            onSelect={() => setSelectedPaymentMethod(method.id)}
          />
        ))}
      </div>
      {selected && (
        <PaymentTicket key={selected.id} method={selected} accent={accent} copiedText={copiedText} onCopy={handleCopyText} onEnlargeQr={openQrDialog} show={show} />
      )}
    </fieldset>
  )
}
