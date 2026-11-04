import type { CartLine } from '@/lib/cart/cart'
import type { AppOrderDelivery, AppOrderDraft } from '@/lib/contract'

/** The bag as the server reads it: ids, quantities and picks — never prices or labels. */
export function draftLines(lines: readonly CartLine[]): AppOrderDraft['lines'] {
  return lines.map((line) => ({ itemId: line.itemId, quantity: line.quantity, selections: line.selections }))
}

export interface DraftInput {
  orderTypeId: string
  outletId: string | null
  lines: readonly CartLine[]
  paymentMethodId: string
  /** Only for a method that needs proof; blank = none. */
  paymentReference: string | null
  /** A voucher the server's preview says applies; null otherwise. */
  voucherCode: string | null
  rewardId: string | null
  delivery: AppOrderDelivery | null
  notes: string
}

const blankToNull = (value: string | null) => {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}

export function buildOrderDraft(input: DraftInput): AppOrderDraft {
  return {
    orderTypeId: input.orderTypeId,
    outletId: input.outletId,
    lines: draftLines(input.lines),
    paymentMethodId: input.paymentMethodId,
    paymentReference: blankToNull(input.paymentReference),
    voucherCode: blankToNull(input.voucherCode),
    rewardId: input.rewardId,
    delivery: input.delivery,
    notes: input.notes.trim(),
  }
}

/** JSON with every object's keys sorted, so the same content always reads the same. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

/**
 * What makes two attempts "the same order". The courier quote token is left
 * out on purpose: re-quoting an expired Lalamove quote is the same order, and
 * a retry after a lost answer must reuse the key so the store can't place it twice.
 */
export function draftFingerprint(draft: AppOrderDraft): string {
  const delivery = draft.delivery ? { address: draft.delivery.address, lat: draft.delivery.lat, lng: draft.delivery.lng } : null
  return stableStringify({ ...draft, delivery })
}
