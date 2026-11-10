'use client'

/**
 * The rows and marks the payment designs share (payment-choices.tsx and the
 * v3 designs in payment-choices-more.tsx): a hidden native radio inside a
 * label, so the browser's own radio group handles the keyboard.
 */

import { Receipt } from 'lucide-react'

import { cornersClass, type CornersChoice } from '@/lib/page-designer/knobs'
import { isPaymentProofRequired } from '@/lib/payment-proof'
import type { PaymentMethod } from '@/types/database'

import { QR_BACKDROP, SHOW_ALL_PAYMENT_PARTS, type PaymentShow } from './payment-method-list'

export interface ChoiceProps {
  method: PaymentMethod
  isSelected: boolean
  corners: CornersChoice
  show?: PaymentShow
  onSelect: () => void
}

/** Keyboard focus lands on the hidden radio; the ring shows on its label. */
export const FOCUS_RING =
  'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-[color:var(--co-accent)] has-[:focus-visible]:ring-offset-[color:var(--co-card)]'

export const surface = (isSelected: boolean) =>
  isSelected
    ? 'border-[color:var(--co-accent)] bg-[var(--co-accent-soft)]'
    : 'border-[color:var(--co-border)] bg-[var(--co-card)] hover:border-[color:var(--co-accent-border)]'

export function Radio({ method, isSelected, onSelect }: Pick<ChoiceProps, 'method' | 'isSelected' | 'onSelect'>) {
  return <input type="radio" name="payment-method" value={method.id} checked={isSelected} onChange={onSelect} className="sr-only" />
}

/** 40px mark for a row: the method's QR, otherwise its first letter. */
export function SmallMark({ method }: { method: PaymentMethod }) {
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

/** The "Proof required" line under a method's name. */
export function ProofLine({ method }: { method: PaymentMethod }) {
  if (!isPaymentProofRequired(method)) return null
  return (
    <span data-part="badge" className="mt-0.5 flex items-center gap-1 text-xs text-[color:var(--co-muted)]">
      <Receipt className="h-3 w-3" aria-hidden="true" /> Proof required
    </span>
  )
}

export function RadioTick({ isSelected }: { isSelected: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-part="tick"
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
        isSelected ? 'border-[color:var(--co-accent)]' : 'border-[color:var(--co-border)]'
      }`}
    >
      {isSelected && <span className="h-2.5 w-2.5 rounded-full bg-[var(--co-accent)]" />}
    </span>
  )
}

export function Row({ method, isSelected, corners, show = SHOW_ALL_PAYMENT_PARTS, onSelect }: ChoiceProps) {
  return (
    <label
      data-branding-scope="checkout/choice"
      data-part="option"
      data-on={isSelected ? '' : undefined}
      className={`flex min-h-14 w-full cursor-pointer items-center gap-3 border-2 px-3 py-2.5 transition-[border-color,background-color] ${cornersClass(corners, 'rounded-xl')} ${FOCUS_RING} ${surface(isSelected)}`}
    >
      <Radio method={method} isSelected={isSelected} onSelect={onSelect} />
      {show.icons && <SmallMark method={method} />}
      <span className="min-w-0 flex-1">
        <span data-part="option-label" className="block truncate text-sm font-semibold text-[color:var(--co-text)]">{method.name}</span>
        {show.proof && <ProofLine method={method} />}
      </span>
      <RadioTick isSelected={isSelected} />
    </label>
  )
}
