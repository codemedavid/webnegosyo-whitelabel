/**
 * The Activity log in an export: the Store Activity log read through the
 * caller's own session, every page of it, oldest first, worded the way the
 * Activity screen words it.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { MAX_ACTIVITY_ROWS, PREVIEW_FULL_ACTIVITY_ROWS } from '@/lib/exports/read/activity-read'
import { previewExport, runExport, type ExportInput } from '@/lib/exports/run-export'
import type { BuiltSheet } from '@/lib/exports/types'
import { DAY, NOW, TENANT, access, contextFor, noReports } from './export-fixtures'

const ANA = '11111111-1111-4111-8111-111111111111'
const START = Date.parse(`${DAY.from}T00:00:00+08:00`)

interface RawRow extends Record<string, unknown> {
  id: string
  occurred_at: string
  is_routine: boolean
  outlet_id: string | null
}

const uuid = (index: number) => `44444444-4444-4444-8444-${String(index).padStart(12, '0')}`

function raw(index: number, overrides: Record<string, unknown> = {}): RawRow {
  return {
    id: uuid(index),
    outlet_id: null,
    outlet_name: null,
    // One a minute from 08:00 Manila.
    occurred_at: new Date(START + 8 * 3_600_000 + index * 60_000).toISOString(),
    category: 'orders',
    kind: 'order.cancelled',
    is_routine: false,
    actor_user_id: ANA,
    actor_name: 'Ana Cruz',
    approved_by_name: null,
    amount: 180,
    quantity: null,
    unit: null,
    reason: 'Wrong item',
    note: null,
    subject_type: 'order',
    subject_ref: null,
    order_number: `#${index}`,
    before: null,
    after: null,
    summary: { title: `#${index} cancelled` },
    flags: [],
    reviewed_at: null,
    reviewed_by_name: null,
    ...overrides,
  } as RawRow
}

interface Call {
  fn: string
  args: Record<string, unknown>
}

/** A database that pages the log the way `get_store_activity` does: newest first, keyset, at most `p_limit`. */
function activityDb(rows: readonly RawRow[], error: { message: string; code?: string } | null = null) {
  const calls: Call[] = []
  const newestFirst = [...rows].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.id.localeCompare(a.id))
  const visible = (args: Record<string, unknown>) =>
    newestFirst.filter(
      (row) =>
        (args.p_include_routine === true || !row.is_routine) &&
        row.occurred_at >= new Date(String(args.p_since)).toISOString() &&
        row.occurred_at < new Date(String(args.p_until)).toISOString(),
    )
  const client = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args })
      if (error) return { data: null, error }
      if (fn === 'get_store_activity_summary') {
        return { data: { byKind: [{ kind: 'order.cancelled', statutory: false, count: visible({ ...args, p_include_routine: false }).length, amount: 0, quantity: null }], byActor: [], byDay: [], routine: [], flaggedOpen: 0 }, error: null }
      }
      const before = args.p_before_occurred_at ? new Date(String(args.p_before_occurred_at)).toISOString() : null
      const page = visible(args)
        .filter((row) => before === null || row.occurred_at < before || (row.occurred_at === before && row.id < String(args.p_before_id)))
        .slice(0, Number(args.p_limit))
      return { data: page, error: null }
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

function input(client: SupabaseClient, keys: Parameters<typeof access> = ['reports', 'activity_view']): ExportInput {
  return {
    context: contextFor({ period: 'custom', ...DAY }),
    storeName: 'Shop',
    access: access(...keys),
    reportClient: noReports,
    detailClient: client as never,
    bookClient: client,
    sheets: ['activity'],
    now: NOW,
  }
}

function records(sheet: BuiltSheet): Array<Record<string, unknown>> {
  return sheet.rows.map((row) => Object.fromEntries(sheet.columns.map((entry, index) => [entry.id, row[index]])))
}

const LOG: RawRow[] = [
  ...Array.from({ length: 230 }, (_, index) => raw(index)),
  // Every order placed is in the Orders sheet, not here.
  raw(900, { kind: 'order.placed', is_routine: true }),
  // Not these dates.
  raw(901, { occurred_at: new Date(START - 60_000).toISOString() }),
  raw(902, { occurred_at: new Date(START + 24 * 3_600_000).toISOString() }),
]

describe('activity log', () => {
  it('lists every action of the dates past the page size, from the start of the period, without the routine lines', async () => {
    const db = activityDb(LOG)
    const { sheets } = await runExport(input(db.client))
    const rows = records(sheets[0])
    expect(rows).toHaveLength(230)
    expect(rows.map((row) => row.order_no)).toEqual(Array.from({ length: 230 }, (_, index) => `#${index}`))
    // Three pages of 100, each asked for after the last row of the one before.
    const pages = db.calls.filter((call) => call.fn === 'get_store_activity')
    expect(pages).toHaveLength(3)
    expect(pages.map((call) => call.args.p_limit)).toEqual([100, 100, 100])
    expect(pages[0].args).toMatchObject({ p_tenant_id: TENANT, p_include_routine: false, p_before_id: null, p_outlet_id: null })
    expect(pages[1].args.p_before_id).toBe(uuid(130))
    expect(db.calls.some((call) => call.fn === 'get_store_activity_summary')).toBe(false)
  })

  it('says who did what, when, for how much, who approved it and what needs a look', async () => {
    const db = activityDb([
      raw(0),
      raw(1, {
        category: 'money',
        kind: 'refund.issued',
        amount: -250.5,
        reason: 'Cold food',
        approved_by_name: 'Marco Reyes',
        flags: ['cash_refund_noncash_order'],
        reviewed_by_name: 'Owner',
        summary: { paymentMethod: 'Cash' },
        order_number: '#42',
      }),
    ])
    const { sheets } = await runExport(input(db.client))
    const [first, second] = records(sheets[0])
    expect(first).toMatchObject({ date: DAY.from, time: '08:00', category: 'Orders', who: 'Ana Cruz', amount: 180, order_no: '#0', reason: 'Wrong item', needs_look: null })
    expect(String(first.what)).toMatch(/#0/)
    expect(second).toMatchObject({
      category: 'Money',
      amount: -250.5,
      approved_by: 'Marco Reyes',
      reason: 'Cold food',
      needs_look: 'Refunded in cash, but the customer paid by GCash, Maya or card.',
      reviewed_by: 'Owner',
    })
    expect(String(second.what)).toMatch(/Ana/)
    expect(String(second.details)).toMatch(/approved by Marco/)
  })

  it('needs the activity key, and says so when the database refuses', async () => {
    await expect(runExport(input(activityDb(LOG).client, ['reports']))).rejects.toThrow(/Nothing to export/)
    await expect(runExport(input(activityDb(LOG, { message: 'no', code: '42501' }).client))).rejects.toThrow(/may not see the store activity log/)
    await expect(runExport(input(activityDb(LOG, { message: 'boom' }).client))).rejects.toThrow(/could not be read/)
  })

  it('previews a quiet period whole: the exact count, and the first rows the file will have', async () => {
    const db = activityDb(LOG)
    const preview = await previewExport(input(db.client))
    const [sheet] = preview.sheets
    expect(sheet.rows).toBe(230)
    expect(sheet.peek).toHaveLength(5)
    expect(sheet.peek[0][sheet.columns.indexOf('Order #')]).toBe('#0')
    expect(sheet.notes.join(' ')).not.toMatch(/most recent/)
    expect(db.calls.map((call) => call.fn)).toEqual(['get_store_activity_summary', 'get_store_activity', 'get_store_activity', 'get_store_activity'])
  })

  it('previews a busy period by its count and its newest page only, and says the rows shown are the latest', async () => {
    const busy = Array.from({ length: PREVIEW_FULL_ACTIVITY_ROWS + 1 }, (_, index) => raw(index, { occurred_at: new Date(START + index * 1000).toISOString() }))
    const db = activityDb(busy)
    const preview = await previewExport(input(db.client))
    const [sheet] = preview.sheets
    expect(sheet.rows).toBe(busy.length)
    expect(sheet.peek[0][sheet.columns.indexOf('Order #')]).toBe(`#${busy.length - 100}`)
    expect(sheet.notes.join(' ')).toMatch(/most recent actions/)
    expect(db.calls.map((call) => call.fn)).toEqual(['get_store_activity_summary', 'get_store_activity'])
  })

  it('refuses a period with more actions than one file lists, in the preview and the file', async () => {
    const flood = Array.from({ length: MAX_ACTIVITY_ROWS + 101 }, (_, index) => raw(index, { occurred_at: new Date(START + index * 1000).toISOString() }))
    await expect(previewExport(input(activityDb(flood).client))).rejects.toThrow(/more than 10,000 actions/)
    await expect(runExport(input(activityDb(flood).client))).rejects.toThrow(/more than 10,000 actions/)
  })
})
