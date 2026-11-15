/**
 * The store's other books in an export: cash in and out, stock on hand and
 * stock movements, read through a client that hands back a few rows per
 * response (a reader that stops at the first page fails here).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { previewExport, runExport, type ExportInput } from '@/lib/exports/run-export'
import type { BuiltSheet } from '@/lib/exports/types'
import { DAY, NOW, TENANT, access, contextFor, noReports, seedStore } from './export-fixtures'

const PAGE = 3
const AT = (hour: number) => `${DAY.from}T${String(hour).padStart(2, '0')}:00:00+08:00`

const moves = [
  { id: 'm1', tenant_id: TENANT, shift_id: 's1', outlet_id: null, kind: 'pay_out', amount: 250, reason: 'Ice', recorded_by_name: 'Ana', taken_by_name: 'Ben', to_safe: false, created_at: AT(9) },
  { id: 'm2', tenant_id: TENANT, shift_id: 's1', outlet_id: null, kind: 'pay_in', amount: 500, reason: 'Change fund', recorded_by_name: 'Ana', taken_by_name: null, to_safe: false, created_at: AT(10) },
  { id: 'm3', tenant_id: TENANT, shift_id: 's1', outlet_id: null, kind: 'collect', amount: 1000, reason: null, recorded_by_name: 'Ana', taken_by_name: 'Owner', to_safe: true, created_at: AT(11) },
  { id: 'm4', tenant_id: TENANT, shift_id: 's1', outlet_id: null, kind: 'pay_out', amount: 80.5, reason: 'Tape', recorded_by_name: 'Ana', taken_by_name: null, to_safe: false, created_at: AT(12) },
  { id: 'other', tenant_id: 'another-store', shift_id: 's9', outlet_id: null, kind: 'pay_out', amount: 9999, reason: 'x', recorded_by_name: 'x', taken_by_name: null, to_safe: false, created_at: AT(12) },
]

const items = [
  { id: 'i1', tenant_id: TENANT, name: 'Rice', category: 'Dry', stock_unit_id: 'u1', current_qty: 12, reorder_level: 5, is_active: true, counted_at: null },
  { id: 'i2', tenant_id: TENANT, name: 'Eggs', category: null, stock_unit_id: 'u2', current_qty: 4, reorder_level: 6, is_active: true, counted_at: AT(8) },
  { id: 'i3', tenant_id: TENANT, name: 'Milk', category: null, stock_unit_id: 'u1', current_qty: 0, reorder_level: 0, is_active: true, counted_at: null },
  { id: 'i4', tenant_id: TENANT, name: 'Old syrup', category: null, stock_unit_id: 'u1', current_qty: 3, reorder_level: 0, is_active: false, counted_at: null },
]
const units = [
  { id: 'u1', tenant_id: TENANT, abbreviation: 'kg' },
  { id: 'u2', tenant_id: TENANT, abbreviation: 'pc' },
]
const movements = Array.from({ length: 8 }, (_, index) => ({
  id: `sm${index}`,
  tenant_id: TENANT,
  inventory_item_id: index % 2 === 0 ? 'i1' : 'i2',
  outlet_id: null,
  reason: index === 0 ? 'receive' : 'sale',
  quantity_delta: index === 0 ? 20 : -1,
  balance_after: 20 - index,
  note: null,
  order_id: index === 0 ? null : `o-${index}`,
  created_at: AT(8 + index),
}))

const remittance = (id: string, hour: number, extra: Record<string, unknown> = {}) => ({
  id,
  tenant_id: TENANT,
  outlet_id: null,
  kind: 'shift',
  shift_id: 's1',
  business_day: DAY.from,
  cashier_user_id: 'u-ana',
  cashier_name: 'Ana',
  handed_over_cents: 500000,
  remitted_to: 'u-owner',
  remitted_to_name: 'Owner',
  to_safe: false,
  status: 'accepted',
  received_cents: 500000,
  received_by_name: 'Owner',
  received_at: AT(hour + 1),
  accept_method: 'app',
  is_self_received: false,
  receiver_note: null,
  dispute_reason: null,
  resolved_at: null,
  resolved_by_name: null,
  resolved_note: null,
  created_at: AT(hour),
  ...extra,
})
const remittances = [
  remittance('r1', 9),
  remittance('r2', 10, { received_cents: 495000, receiver_note: 'One ₱50 short', accept_method: 'pin', is_self_received: true }),
  remittance('r3', 11, { kind: 'pickup', business_day: null, to_safe: true, remitted_to: null, remitted_to_name: null, status: 'pending', received_cents: null, received_by_name: null, received_at: null, accept_method: null }),
  remittance('r4', 12, { handed_over_cents: null, status: 'disputed', received_cents: null, received_by_name: null, received_at: null, accept_method: null, dispute_reason: 'Envelope was empty' }),
  remittance('r5', 13, { status: 'resolved', resolved_by_name: 'Owner', resolved_note: 'Found in the safe' }),
  remittance('other', 9, { tenant_id: 'another-store' }),
  // The next day: outside the dates.
  remittance('late', 9, { created_at: '2026-10-02T09:00:00+08:00' }),
]

const dayClose = (id: string, version: number, extra: Record<string, unknown> = {}) => ({
  id,
  tenant_id: TENANT,
  outlet_id: null,
  business_day: DAY.from,
  version,
  status: 'closed',
  window_start: AT(0),
  window_end: AT(23),
  snapshot: {
    sales: { netCents: 1234500, orders: 42, discountCents: 30000, collectedByMethod: [], unpaidCents: 0, overpaidCents: 0 },
    drawers: { shifts: [], totals: { expectedCents: 800000, countedCents: 795000, varianceCents: -5000, handedOverCents: 795000, receivedCents: 795000, collectedMidShiftCents: 0 } },
    cashToAccountForCents: 795000,
  },
  sales_source: 'platform_sql',
  forced_shift_ids: [],
  unsettled_remittance_ids: [],
  note: null,
  closed_by_name: 'Owner',
  closed_at: AT(22),
  deposit_cents: null,
  deposit_to: null,
  deposit_ref: null,
  deposit_proof_url: null,
  deposit_recorded_at: null,
  reopened_by_name: null,
  reopened_at: null,
  reopen_reason: null,
  ...extra,
})
const dayCloses = [
  dayClose('d1', 1, { status: 'reopened', reopened_by_name: 'Owner', reopened_at: AT(23), reopen_reason: 'Late order' }),
  dayClose('d2', 2, { deposit_cents: 795000, deposit_to: 'BDO savings', deposit_ref: 'TX-1', forced_shift_ids: ['s9'], unsettled_remittance_ids: ['r3', 'r4'], note: 'All good' }),
  // A store whose sales are not on the main database: the close holds the drawers only.
  dayClose('d3', 3, { sales_source: 'drawers_only', snapshot: { sales: null, drawers: { shifts: [], totals: {} } } }),
  dayClose('d4', 4),
  dayClose('other', 1, { tenant_id: 'another-store' }),
  dayClose('next', 1, { business_day: '2026-10-02' }),
]

function input(sheets: ExportInput['sheets'], keys: Parameters<typeof access> = ['reports', 'cash_manage', 'inventory']): ExportInput {
  const store = seedStore([], { cash_remittances: remittances, business_day_closes: dayCloses, shift_cash_movements: moves, inventory_items: items, inventory_units: units, stock_movements: movements, inventory_stock: [] }, PAGE)
  return {
    context: contextFor({ period: 'custom', ...DAY }),
    storeName: 'Shop',
    access: access(...keys),
    reportClient: noReports,
    detailClient: store.client,
    bookClient: store.client as unknown as SupabaseClient,
    sheets,
    now: NOW,
    pageSize: PAGE,
  }
}

function column(sheet: BuiltSheet, id: string): unknown[] {
  const index = sheet.columns.findIndex((entry) => entry.id === id)
  if (index < 0) throw new Error(`no column ${id}`)
  return sheet.rows.map((row) => row[index])
}

describe('cash in and out', () => {
  it('lists every movement of this store past the page size; money in is a plus, money out a minus', async () => {
    const { sheets } = await runExport(input(['cash_moves']))
    expect(column(sheets[0], 'amount')).toEqual([-250, 500, -1000, -80.5])
    expect(column(sheets[0], 'kind')).toEqual(['Cash paid out', 'Cash put in', 'Cash collected from the drawer', 'Cash paid out'])
    expect(column(sheets[0], 'to_safe')).toEqual([null, null, 'Yes', null])
  })

  it('is left out, with the reason, for an account without the cash key', async () => {
    const result = await runExport(input(['cash_moves', 'stock_on_hand'], ['reports', 'inventory']))
    expect(result.sheets.map((sheet) => sheet.id)).toEqual(['stock_on_hand'])
    expect(result.leftOut.map((sheet) => sheet.id)).toEqual(['cash_moves'])
  })

  it('previews the count and the first rows without reading the book whole', async () => {
    const preview = await previewExport({ ...input(['cash_moves']), pageSize: undefined })
    expect(preview.sheets[0].rows).toBe(4)
    // The fake hands back three rows a response: the count is of the whole book, the peek is one page.
    expect(preview.sheets[0].peek).toHaveLength(PAGE)
  })
})

describe('remittances', () => {
  it('lists every hand-over of the dates past the page size, with what arrived and how it ended', async () => {
    const { sheets } = await runExport(input(['remittances']))
    expect(column(sheets[0], 'handed_over')).toEqual([5000, 5000, 5000, null, 5000])
    expect(column(sheets[0], 'received')).toEqual([5000, 4950, null, null, 5000])
    expect(column(sheets[0], 'difference')).toEqual([0, -50, null, null, 0])
    expect(column(sheets[0], 'status')).toEqual(['Received', 'Received', 'Waiting to be received', 'Disputed', 'Settled'])
    expect(column(sheets[0], 'kind')).toEqual(['End of shift', 'End of shift', 'Collected mid-shift', 'End of shift', 'End of shift'])
    expect(column(sheets[0], 'given_to')).toEqual(['Owner', 'Owner', 'The store safe', 'Owner', 'Owner'])
    expect(column(sheets[0], 'how')).toEqual(['In the receiver’s app', 'PIN on the cashier’s device (received by the same person)', null, null, 'In the receiver’s app'])
    expect(column(sheets[0], 'receiver_note')[1]).toBe('One ₱50 short')
    expect(column(sheets[0], 'dispute_reason')[3]).toBe('Envelope was empty')
    expect(column(sheets[0], 'resolved_note')[4]).toBe('Found in the safe')
    // A pickup carries no business day and is still listed, by when it was handed over.
    expect(column(sheets[0], 'business_day')[2]).toBeNull()
  })

  it('needs the cash key, and previews the count with the first rows only', async () => {
    const refused = await runExport(input(['remittances', 'stock_on_hand'], ['reports', 'inventory']))
    expect(refused.leftOut.map((sheet) => sheet.id)).toEqual(['remittances'])
    const preview = await previewExport({ ...input(['remittances', 'day_closes']), pageSize: undefined })
    expect(preview.sheets.map((sheet) => [sheet.id, sheet.rows])).toEqual([['remittances', 5], ['day_closes', 4]])
    expect(preview.sheets[0].peek.length).toBeLessThanOrEqual(5)
  })
})

describe('day closes', () => {
  it('lists every version of every closed day with the figures frozen at the close', async () => {
    const { sheets } = await runExport(input(['day_closes']))
    expect(column(sheets[0], 'version')).toEqual([1, 2, 3, 4])
    expect(column(sheets[0], 'status')).toEqual(['Reopened', 'Closed', 'Closed', 'Closed'])
    expect(column(sheets[0], 'net')).toEqual([12345, 12345, null, 12345])
    expect(column(sheets[0], 'orders')).toEqual([42, 42, null, 42])
    expect(column(sheets[0], 'expected')).toEqual([8000, 8000, null, 8000])
    expect(column(sheets[0], 'difference')).toEqual([-50, -50, null, -50])
    expect(column(sheets[0], 'deposit')).toEqual([null, 7950, null, null])
    expect(column(sheets[0], 'deposit_to')[1]).toBe('BDO savings')
    expect(column(sheets[0], 'forced_shifts')).toEqual([0, 1, 0, 0])
    expect(column(sheets[0], 'open_remittances')).toEqual([0, 2, 0, 0])
    expect(column(sheets[0], 'reopen_reason')[0]).toBe('Late order')
  })
})

describe('stock on hand', () => {
  it('lists active ingredients with their state, and no cost columns without the costs key', async () => {
    const { sheets } = await runExport(input(['stock_on_hand']))
    const [sheet] = sheets
    expect(sheet.columns.map((entry) => entry.id)).not.toContain('unit_cost')
    expect(sheet.columns.map((entry) => entry.id)).not.toContain('value')
    expect(column(sheet, 'ingredient')).toEqual(['Eggs', 'Milk', 'Rice'])
    expect(column(sheet, 'state')).toEqual(['Low', 'Out', 'OK'])
    expect(column(sheet, 'unit')).toEqual(['pc', 'kg', 'kg'])
    expect(sheet.notes.join(' ')).toMatch(/on the shelf now/)
  })
})

describe('stock movements', () => {
  it('lists every movement in order, named, past the page size', async () => {
    const { sheets } = await runExport(input(['stock_movements']))
    const [sheet] = sheets
    expect(sheet.rows).toHaveLength(movements.length)
    expect(column(sheet, 'reason').slice(0, 2)).toEqual(['Received', 'Sold'])
    expect(column(sheet, 'ingredient').slice(0, 2)).toEqual(['Rice', 'Eggs'])
    expect(column(sheet, 'change').reduce((sum: number, value) => sum + Number(value), 0)).toBe(20 - 7)
  })
})

describe('range', () => {
  it('holds the books to the row-by-row range', async () => {
    const long = { ...input(['stock_movements']), context: contextFor({ period: 'custom', from: '2026-01-01', to: '2026-06-30' }) }
    await expect(runExport(long)).rejects.toThrow(/up to 93 days/)
  })
})
