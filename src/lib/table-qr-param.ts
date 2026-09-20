/**
 * The table a scanned code named, remembered past the page it arrived on.
 *
 * A table's QR (printed from the merchant app) opens `/{tenant}/menu?table=12`
 * and stops there. Cart and checkout are separate routes with no query
 * string, so without somewhere to put it the table is forgotten the moment
 * the guest taps "Cart" and checkout asks them to type it. This is the same
 * small fact `linked-outlet.ts` keeps for a branch link: a label and when it
 * was seen — and, like it, deliberately apart from the cart's own state.
 *
 * Short-lived on purpose: a guest who scanned at lunch and comes back at
 * dinner sits somewhere else.
 */

import { normalizeTableNumber, TABLE_NUMBER_FIELD_NAME } from '@/lib/order-table-number'
import type { StorageLike } from '@/lib/outlets/outlet-selection'

export const TABLE_QUERY_PARAM = 'table'
export const LINKED_TABLE_KEY_PREFIX = 'linked_table_'
export const LINKED_TABLE_TTL_MS = 4 * 60 * 60 * 1000

const storageKey = (tenantSlug: string): string => `${LINKED_TABLE_KEY_PREFIX}${tenantSlug}`

/** The table named in the URL, normalized, or null when there is none. */
export function readTableParam(get: (key: string) => string | null): string | null {
  const raw = get(TABLE_QUERY_PARAM)
  if (typeof raw !== 'string') return null
  const label = normalizeTableNumber(raw)
  return label === '' ? null : label
}

export function readLinkedTable(storage: StorageLike, tenantSlug: string, now: number): string | null {
  let raw: string | null
  try {
    raw = storage.getItem(storageKey(tenantSlug))
  } catch {
    return null
  }
  if (!raw) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { label, savedAt } = parsed as Record<string, unknown>
    if (typeof label !== 'string' || label === '' || typeof savedAt !== 'number') return null
    if (now - savedAt > LINKED_TABLE_TTL_MS) {
      clearLinkedTable(storage, tenantSlug)
      return null
    }
    return label
  } catch {
    clearLinkedTable(storage, tenantSlug)
    return null
  }
}

export function writeLinkedTable(storage: StorageLike, tenantSlug: string, label: string, now: number): void {
  const normalized = normalizeTableNumber(label)
  if (normalized === '') return
  try {
    storage.setItem(storageKey(tenantSlug), JSON.stringify({ label: normalized, savedAt: now }))
  } catch {
    // A guest whose table cannot be remembered types it at checkout, which is
    // what they did before this existed.
  }
}

export function clearLinkedTable(storage: StorageLike, tenantSlug: string): void {
  try {
    storage.removeItem(storageKey(tenantSlug))
  } catch {
    // See writeLinkedTable.
  }
}

/**
 * The checkout's initial field values with the table filled in — only when
 * the order type actually asks for one, so a pickup form never grows a
 * phantom field. Returns a new object; the input is never touched.
 */
export function seedTableField(
  initialData: Record<string, string>,
  fields: ReadonlyArray<{ field_name: string }>,
  label: string | null,
): Record<string, string> {
  if (!label) return { ...initialData }
  const asksForTable = fields.some((field) => field.field_name === TABLE_NUMBER_FIELD_NAME)
  if (!asksForTable) return { ...initialData }
  return { ...initialData, [TABLE_NUMBER_FIELD_NAME]: label }
}

/**
 * A guest who scanned a table code is dining in. Prefer the dine-in order
 * type over whatever the browser last remembered — but only when the store
 * has one enabled, and never on a return visit without a scan.
 */
export function preferDineInOrderType(
  orderTypes: ReadonlyArray<{ id: string; type: string }>,
  current: string | null,
  hasLinkedTable: boolean,
): string | null {
  if (!hasLinkedTable) return current
  const dineIn = orderTypes.find((orderType) => orderType.type === 'dine_in')
  return dineIn ? dineIn.id : current
}
