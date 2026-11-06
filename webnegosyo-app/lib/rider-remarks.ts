/**
 * The `remarks` a Lalamove rider reads at the drop-off.
 *
 * Lalamove sends the rider to the coordinates we give it; in a Philippine
 * subdivision those are often not enough, and the unit, landmark and note are
 * what finds the house. Until 2026-10 the web booking sent `''`.
 *
 * Lalamove caps remarks at 1,500 characters and wants `\r\n` between lines.
 * When the answers overflow, the cut falls on the least useful line first: the
 * pin link is never cut, then landmark, unit, the store's note and the
 * customer's note are kept in that order, and the address text (the rider
 * already has it on the stop) goes first.
 *
 * Mirror of the web's src/lib/delivery/rider-remarks.ts, so the order screen
 * shows what the rider will read. tests/unit/delivery/rider-remarks.test.ts runs
 * both and fails when they drift.
 */

import { DELIVERY_ADDRESS_FIELD_NAME } from './customer-details'
import { DELIVERY_STORE_NOTE_KEY, findDeliveryDetails } from './delivery-details'

export const RIDER_REMARKS_MAX_LENGTH = 1500
const LINE_BREAK = '\r\n'
const ELLIPSIS = '…'
/** A line cut shorter than this says nothing useful and is dropped. */
const MIN_USEFUL_LINE_LENGTH = 16

interface RemarkLine {
  order: number
  text: string
}

function parseCoordinate(value: unknown, limit: number): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  if (typeof value === 'string' && value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && Math.abs(parsed) <= limit ? parsed : null
}

/** A Google Maps link to an exact pin — riders mostly navigate with it. */
export function pinLink(lat: unknown, lng: unknown): string | null {
  const latitude = parseCoordinate(lat, 90)
  const longitude = parseCoordinate(lng, 180)
  if (latitude === null || longitude === null) return null
  if (latitude === 0 && longitude === 0) return null
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
}

function fit(text: string, budget: number): string {
  if (text.length <= budget) return text
  if (budget < MIN_USEFUL_LINE_LENGTH) return ''
  return `${text.slice(0, budget - ELLIPSIS.length).trimEnd()}${ELLIPSIS}`
}

export function buildRiderRemarks(
  customerData: Record<string, unknown> | null | undefined,
  addressFieldName: string = DELIVERY_ADDRESS_FIELD_NAME,
): string {
  const data = customerData ?? {}
  const details = findDeliveryDetails(data)
  const address = typeof data[addressFieldName] === 'string' ? (data[addressFieldName] as string).trim() : ''
  const link = pinLink(data.delivery_lat, data.delivery_lng)
  const storeNote = typeof data[DELIVERY_STORE_NOTE_KEY] === 'string' ? (data[DELIVERY_STORE_NOTE_KEY] as string).trim() : ''

  // Listed by priority (what survives a cut); `order` is where it prints.
  const candidates: RemarkLine[] = [
    { order: 6, text: link ? `Pin: ${link}` : '' },
    { order: 2, text: details.landmark ? `Landmark: ${details.landmark}` : '' },
    { order: 1, text: details.unit ? `House/Unit: ${details.unit}` : '' },
    { order: 4, text: storeNote ? `Store note: ${storeNote}` : '' },
    { order: 3, text: details.riderNote ? `Note: ${details.riderNote}` : '' },
    { order: 5, text: address ? `Address: ${address}` : '' },
  ].filter((line) => line.text)

  let remaining = RIDER_REMARKS_MAX_LENGTH
  const kept: RemarkLine[] = []
  for (const line of candidates) {
    const separator = kept.length > 0 ? LINE_BREAK.length : 0
    const text = fit(line.text, remaining - separator)
    if (!text) continue
    kept.push({ order: line.order, text })
    remaining -= text.length + separator
  }

  return kept
    .sort((a, b) => a.order - b.order)
    .map((line) => line.text)
    .join(LINE_BREAK)
}

/**
 * What a store hands its own rider: who, how to reach them, then the same lines
 * Lalamove's rider reads. Plain line breaks, for chat apps.
 */
export function buildRiderMessage(input: {
  customerName?: string | null
  customerContact?: string | null
  customerData: Record<string, unknown> | null | undefined
}): string {
  const who = [input.customerName?.trim(), input.customerContact?.trim()].filter(Boolean).join(' · ')
  return [who, buildRiderRemarks(input.customerData).split(LINE_BREAK).join('\n')].filter(Boolean).join('\n')
}
