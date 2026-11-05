'use client'

/**
 * The payment chooser in the designs a Page Designer checkout can pick. Only
 * the chooser changes: every design is the same radio group over the same
 * `paymentMethods` / `setSelectedPaymentMethod`, and the chosen method opens
 * the same ticket (QR, copyable details, proof note) as PaymentMethodList.
 * `wallet` IS PaymentMethodList (the standard checkouts' look).
 */

import { Check, Receipt } from 'lucide-react'
import type { ReactNode } from 'react'

import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import { getCheckoutPalette } from '@/lib/branding-utils'
import { cornersClass, type CornersChoice } from '@/lib/page-designer/knobs'
import type { PaymentDesign } from '@/lib/page-designer/checkout-block-options'
import { isPaymentProofRequired } from '@/lib/payment-proof'
import type { PaymentMethod } from '@/types/database'

import { checkoutThemeStyle } from './checkout-theme'
import { MethodMark, NoPaymentMethods, PaymentMethodList, PaymentTicket, QR_BACKDROP } from './payment-method-list'

export interface PaymentLook {
  design: PaymentDesign
  corners: CornersChoice
}

interface ChoiceProps {
  method: PaymentMethod
  isSelected: boolean
  corners: CornersChoice
  onSelect: () => void
}

/** Keyboard focus lands on the hidden radio; the ring shows on its label. */
const FOCUS_RING =
  'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-[color:var(--co-accent)] has-[:focus-visible]:ring-offset-[color:var(--co-card)]'

const surface = (isSelected: boolean) =>
  isSelected
    ? 'border-[color:var(--co-accent)] bg-[var(--co-accent-soft)]'
    : 'border-[color:var(--co-border)] bg-[var(--co-card)] hover:border-[color:var(--co-accent-border)]'

function Radio({ method, isSelected, onSelect }: Pick<ChoiceProps, 'method' | 'isSelected' | 'onSelect'>) {
  return <input type="radio" name="payment-method" value={method.id} checked={isSelected} onChange={onSelect} className="sr-only" />
}

function GridTile({ method, isSelected, corners, onSelect }: ChoiceProps) {
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
      <MethodMark method={method} accent="var(--co-accent)" accentSoft="var(--co-accent-soft)" />
      <span data-part="option-label" className="line-clamp-2 w-full text-[13px] font-semibold leading-tight text-[color:var(--co-text)]">{method.name}</span>
    </label>
  )
}

/** 40px mark for a row: the method's QR, otherwise its first letter. */
function SmallMark({ method }: { method: PaymentMethod }) {
  if (method.qr_code_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={method.qr_code_url} alt="" className={`h-10 w-10 shrink-0 rounded-lg border border-[color:var(--co-border)] object-cover ${QR_BACKDROP}`} />
  }
  return (
    <span aria-hidden="true" data-part="icon" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--co-accent-soft)] text-base font-bold text-[color:var(--co-accent)]">
      {method.name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

function Row({ method, isSelected, corners, onSelect }: ChoiceProps) {
  return (
    <label
      data-branding-scope="checkout/choice"
      data-part="option"
      data-on={isSelected ? '' : undefined}
      className={`flex min-h-14 w-full cursor-pointer items-center gap-3 border-2 px-3 py-2.5 transition-[border-color,background-color] ${cornersClass(corners, 'rounded-xl')} ${FOCUS_RING} ${surface(isSelected)}`}
    >
      <Radio method={method} isSelected={isSelected} onSelect={onSelect} />
      <SmallMark method={method} />
      <span className="min-w-0 flex-1">
        <span data-part="option-label" className="block truncate text-sm font-semibold text-[color:var(--co-text)]">{method.name}</span>
        {isPaymentProofRequired(method) && (
          <span data-part="badge" className="mt-0.5 flex items-center gap-1 text-xs text-[color:var(--co-muted)]">
            <Receipt className="h-3 w-3" aria-hidden="true" /> Proof required
          </span>
        )}
      </span>
      <span
        aria-hidden="true"
        data-part="tick"
        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
          isSelected ? 'border-[color:var(--co-accent)]' : 'border-[color:var(--co-border)]'
        }`}
      >
        {isSelected && <span className="h-2.5 w-2.5 rounded-full bg-[var(--co-accent)]" />}
      </span>
    </label>
  )
}

/** How the methods sit: two or three across, or one per row. */
const LAYOUT: Record<Exclude<PaymentDesign, 'wallet'>, { Choice: (props: ChoiceProps) => ReactNode; wrap: string }> = {
  grid: { Choice: GridTile, wrap: 'grid grid-cols-2 gap-3 sm:grid-cols-3' },
  rows: { Choice: Row, wrap: 'flex flex-col gap-2' },
}

/** The payment chooser in the block's design (absent look = the standard wallet). */
export function PaymentChoices({ checkout, look }: { checkout: UseCheckoutReturn; look?: PaymentLook }) {
  const { paymentMethods, selectedPaymentMethod, setSelectedPaymentMethod, openQrDialog, handleCopyText, copiedText, orderType, tenant, branding } = checkout
  if (!look || look.design === 'wallet') return <PaymentMethodList checkout={checkout} corners={look?.corners} />

  if (paymentMethods.length === 0) {
    if (!orderType || !tenant) return null
    return (
      <div style={checkoutThemeStyle(checkout)}>
        <NoPaymentMethods />
      </div>
    )
  }

  const { accent } = getCheckoutPalette(tenant, branding)
  const selected = paymentMethods.find((m) => m.id === selectedPaymentMethod) ?? null
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
            onSelect={() => setSelectedPaymentMethod(method.id)}
          />
        ))}
      </div>
      {selected && (
        <PaymentTicket key={selected.id} method={selected} accent={accent} copiedText={copiedText} onCopy={handleCopyText} onEnlargeQr={openQrDialog} />
      )}
    </fieldset>
  )
}
