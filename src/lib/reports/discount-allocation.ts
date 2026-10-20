/**
 * An order's discount, split by kind and between the food and the delivery.
 *
 * The stored payload (`readOrderDiscount`) holds the amount that came off the
 * bill (`total`, lines + delivery) and the labelled lines that explain it. The
 * lines are rounded one by one, so they need not add up to the total; the
 * total is the authority and is shared across the lines by their amounts.
 *
 * Kinds are read from the labels the register and the voucher engine write
 * today ("Discount — PWD …", a "SENIOR/PWD" voucher, "Discount — Employee …").
 * Once the SC/PWD claims ledger (`gov_discount_claims`) is in use, its claims
 * are the authority for those two kinds; labels are the fallback for history.
 */

import type { OrderDiscountPayload, StoredDiscountLine } from '@/lib/order-discount'
import { allocateCents, toCents } from './money'

export const DISCOUNT_KINDS = ['senior', 'pwd', 'senior_pwd', 'voucher', 'manual', 'promo'] as const
export type DiscountKind = (typeof DISCOUNT_KINDS)[number]

export const DISCOUNT_KIND_LABELS: Readonly<Record<DiscountKind, string>> = {
  senior: 'Senior citizen',
  pwd: 'PWD',
  senior_pwd: 'Senior / PWD',
  voucher: 'Vouchers',
  manual: 'Manual discounts',
  promo: 'Promos',
}

/** "Senior's Day" is a promo name, not the statutory discount. */
const SENIOR = /\bsenior\b(?!['’]s)|\bsr\.?\s*citizen\b|\bsc\b/i
const PWD = /\bpwd\b|\bdisabilit(y|ies)\b/i
/** The register's manual discount: "Discount — <reason>". */
const MANUAL = /^\s*discount\s*[—–-]/i

export interface DiscountSplit {
  /** Off the food. Net sales are gross minus this. */
  foodCents: number
  /** Off the delivery fee. Never more than the fee. */
  deliveryCents: number
  /** Every kind, adding up to food + delivery exactly. */
  byKind: Readonly<Record<DiscountKind, number>>
}

export function classifyDiscountLine(line: Pick<StoredDiscountLine, 'label' | 'code' | 'voucherId'>): DiscountKind {
  const text = `${line.label ?? ''} ${line.code ?? ''}`
  const isSenior = SENIOR.test(text)
  const isPwd = PWD.test(text)
  if (isSenior && isPwd) return 'senior_pwd'
  if (isSenior) return 'senior'
  if (isPwd) return 'pwd'
  if (line.voucherId) return 'voucher'
  if (MANUAL.test(line.label ?? '')) return 'manual'
  return 'promo'
}

function emptyKinds(): Record<DiscountKind, number> {
  return Object.fromEntries(DISCOUNT_KINDS.map((kind) => [kind, 0])) as Record<DiscountKind, number>
}

function byKind(totalCents: number, lines: readonly StoredDiscountLine[]): Record<DiscountKind, number> {
  const kinds = emptyKinds()
  if (totalCents === 0) return kinds
  const valid = lines.filter((line) => typeof line === 'object' && line !== null)
  if (valid.length === 0) return { ...kinds, promo: totalCents }

  const shares = allocateCents(
    totalCents,
    valid.map((line) => toCents(line.amount)),
  )
  return valid.reduce((acc, line, index) => {
    const kind = classifyDiscountLine(line)
    return { ...acc, [kind]: acc[kind] + shares[index] }
  }, kinds)
}

/**
 * Splits a stored discount. A negative or non-numeric total is no discount: a
 * discount can only ever lower a bill, and a garbled payload must not raise
 * sales.
 */
export function splitOrderDiscount(payload: OrderDiscountPayload | null, deliveryFeeCents: number): DiscountSplit {
  const totalCents = Math.max(0, toCents(payload?.total))
  if (!payload || totalCents === 0) return { foodCents: 0, deliveryCents: 0, byKind: emptyKinds() }

  const requestedDelivery = Math.max(0, toCents(payload.deliveryDiscount))
  const deliveryCents = Math.min(requestedDelivery, Math.max(0, deliveryFeeCents), totalCents)
  return {
    foodCents: totalCents - deliveryCents,
    deliveryCents,
    byKind: byKind(totalCents, Array.isArray(payload.lines) ? payload.lines : []),
  }
}
