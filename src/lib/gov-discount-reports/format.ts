/**
 * How Senior/PWD figures are written on screen.
 *
 * Centavos are kept: these are tax figures an accountant will tick against
 * receipts, unlike the whole-peso comparison numbers on the branch pages.
 */

import { GOV_DISCOUNT_RULES, type GovDiscountKind } from '@/lib/gov-discount'

const PESO_FORMAT = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const MANILA_DATE_TIME = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

const MANILA_DATE_TIME_FULL = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

/** `₱1,234.50`; negatives as `−₱1,234.50`. */
export function formatPesoCentavos(value: number): string {
  const rounded = Math.round(value * 100) / 100
  const text = `₱${PESO_FORMAT.format(Math.abs(rounded))}`
  return rounded < 0 ? `−${text}` : text
}

/** "Oct 12, 2:30 PM" in Manila. */
export function formatManilaDateTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : MANILA_DATE_TIME.format(date)
}

/** "Oct 12, 2026, 2:30 PM" in Manila — for the detail view. */
export function formatManilaDateTimeFull(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : MANILA_DATE_TIME_FULL.format(date)
}

export function kindCode(kind: GovDiscountKind): string {
  return GOV_DISCOUNT_RULES[kind].code
}

export function kindLabel(kind: GovDiscountKind): string {
  return GOV_DISCOUNT_RULES[kind].label
}

/** "#12", or a short form of the order id when the register sent no label. */
export function orderReference(claim: { orderLabel: string | null; externalOrderId: string }): string {
  if (claim.orderLabel) return claim.orderLabel
  const id = claim.externalOrderId
  return id.length > 8 ? `…${id.slice(-8)}` : id
}

export function formatSalesCount(count: number): string {
  return `${count} ${Math.abs(count) === 1 ? 'sale' : 'sales'}`
}
