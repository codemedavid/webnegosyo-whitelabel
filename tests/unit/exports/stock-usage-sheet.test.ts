/**
 * "Stock used and missing" in an export: the Daily stock report, one day after
 * another. Read through a client that hands back a few rows per response, and
 * checked against the SAME pure reconciliation the screen runs.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { MAX_USAGE_MOVEMENTS, PREVIEW_FULL_USAGE_MOVEMENTS } from '@/lib/exports/read/stock-read'
import { previewExport, runExport, type ExportInput } from '@/lib/exports/run-export'
import type { BuiltSheet } from '@/lib/exports/types'
import { buildDailyInventoryReport } from '@/lib/inventory/daily-report'
import type { StockMovementReason } from '@/lib/inventory/stock-ledger'
import { NOW, TENANT, access, contextFor, noReports, seedStore } from './export-fixtures'

const PAGE = 3
const DAYS = { from: '2026-10-01', to: '2026-10-02' } as const
const AT = (day: string, hour: number, minute = 0) => `${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+08:00`

const items = [
  { id: 'i1', tenant_id: TENANT, name: 'Rice', category: 'Dry', stock_unit_id: 'u1', current_qty: 12, reorder_level: 5, is_active: true, counted_at: null },
  { id: 'i2', tenant_id: TENANT, name: 'Eggs', category: null, stock_unit_id: 'u2', current_qty: 10, reorder_level: 6, is_active: true, counted_at: null },
]
const units = [
  { id: 'u1', tenant_id: TENANT, abbreviation: 'kg' },
  { id: 'u2', tenant_id: TENANT, abbreviation: 'pc' },
]

interface Seeded {
  id: string
  tenant_id: string
  inventory_item_id: string
  outlet_id: string | null
  reason: StockMovementReason
  quantity_delta: number
  balance_after: number
  note: null
  order_id: null
  created_at: string
}
let serial = 0
const move = (item: string, reason: StockMovementReason, delta: number, after: number, at: string, tenant = TENANT): Seeded => ({
  id: `sm-${String((serial += 1)).padStart(6, '0')}`,
  tenant_id: tenant,
  inventory_item_id: item,
  outlet_id: null,
  reason,
  quantity_delta: delta,
  balance_after: after,
  note: null,
  order_id: null,
  created_at: at,
})

const D1 = DAYS.from
const D2 = DAYS.to
const movements: Seeded[] = [
  move('i1', 'receive', 20, 20, AT(D1, 8)),
  move('i1', 'sale', -2, 18, AT(D1, 9)),
  move('i2', 'sale', -2, 10, AT(D1, 9, 30)),
  move('i1', 'sale', -1, 17, AT(D1, 10)),
  move('i1', 'waste', -0.5, 16.5, AT(D1, 11)),
  // A count found 1.5 kg short.
  move('i1', 'stocktake', -1.5, 15, AT(D1, 20)),
  // An ingredient deleted since: its rows stay in the ledger and name nothing.
  move('i-gone', 'sale', -1, 3, AT(D1, 21)),
  move('i1', 'sale', -4, 11, AT(D2, 12)),
  move('i1', 'void', 1, 12, AT(D2, 13)),
  // Not this store, and not these dates.
  move('i1', 'sale', -99, 0, AT(D1, 12), 'another-store'),
  move('i1', 'sale', -7, 5, AT('2026-10-03', 9)),
  move('i1', 'sale', -7, 5, AT('2026-09-30', 23)),
]

const COSTS: Record<string, number> = { i1: 50, i2: 0 }

function clientFor(ledger: readonly Seeded[], maxRows: number | undefined, costCalls: string[] = []): SupabaseClient {
  const store = seedStore([], { inventory_items: items, inventory_units: units, stock_movements: ledger }, maxRows)
  return {
    from: store.client.from,
    rpc: async (fn: string) => {
      costCalls.push(fn)
      return { data: Object.entries(COSTS).map(([inventory_item_id, unit_cost]) => ({ inventory_item_id, unit_cost })), error: null }
    },
  } as unknown as SupabaseClient
}

function input(keys: Parameters<typeof access>, options: { ledger?: readonly Seeded[]; maxRows?: number; costCalls?: string[] } = {}): ExportInput {
  const maxRows = 'maxRows' in options ? options.maxRows : PAGE
  const client = clientFor(options.ledger ?? movements, maxRows, options.costCalls)
  return {
    context: contextFor({ period: 'custom', ...DAYS }),
    storeName: 'Shop',
    access: access(...keys),
    reportClient: noReports,
    detailClient: client as never,
    bookClient: client,
    sheets: ['stock_usage'],
    now: NOW,
    pageSize: maxRows,
  }
}

function records(sheet: BuiltSheet): Array<Record<string, unknown>> {
  return sheet.rows.map((row) => Object.fromEntries(sheet.columns.map((entry, index) => [entry.id, row[index]])))
}

describe('stock used and missing', () => {
  it('lists one row per ingredient per day it moved, by name, past the page size', async () => {
    const { sheets } = await runExport(input(['reports', 'inventory']))
    const rows = records(sheets[0])
    expect(rows.map((row) => [row.day, row.ingredient])).toEqual([
      [D1, 'Eggs'],
      [D1, 'Rice'],
      [D2, 'Rice'],
    ])
    expect(rows[1]).toEqual({
      day: D1,
      ingredient: 'Rice',
      unit: 'kg',
      opening: 0,
      received: 20,
      used: 3,
      wasted: 0.5,
      transferred: 0,
      count_change: -1.5,
      missing: 1.5,
      closing: 15,
      counted: 'Yes',
    })
    expect(rows[0]).toMatchObject({ unit: 'pc', opening: 12, used: 2, closing: 10, counted: 'No' })
    // A sale taken back gives its stock back: 4 sold, 1 voided.
    expect(rows[2]).toMatchObject({ opening: 15, used: 3, closing: 12, missing: 0 })
  })

  it('adds up on every row: start + received - used - wasted + moved + count = end', async () => {
    const { sheets } = await runExport(input(['reports', 'inventory']))
    for (const row of records(sheets[0])) {
      const n = (key: string) => Number(row[key])
      expect(n('opening') + n('received') - n('used') - n('wasted') + n('transferred') + n('count_change')).toBeCloseTo(n('closing'), 6)
    }
  })

  it('is the Daily stock report of each day: the same rows the screen builds from that day of the ledger', async () => {
    const { sheets } = await runExport(input(['reports', 'inventory', 'costs']))
    const rows = records(sheets[0])
    for (const day of [D1, D2]) {
      const screen = buildDailyInventoryReport({
        movements: movements
          .filter((row) => row.tenant_id === TENANT && row.created_at.startsWith(day))
          .map((row) => ({ inventoryItemId: row.inventory_item_id, reason: row.reason, quantityDelta: row.quantity_delta, balanceAfter: row.balance_after, createdAt: row.created_at, outletId: row.outlet_id })),
        ingredients: items.map((item) => ({ id: item.id, name: item.name, unitCost: COSTS[item.id], stockUnitAbbreviation: item.id === 'i1' ? 'kg' : 'pc' })),
      })
      const filed = rows.filter((row) => row.day === day)
      expect(filed).toHaveLength(screen.rows.length)
      for (const expected of screen.rows) {
        const row = filed.find((entry) => entry.ingredient === expected.name)
        expect(row).toMatchObject({
          opening: expected.opening,
          received: expected.received,
          used: expected.sold,
          wasted: expected.waste,
          transferred: expected.transferred,
          count_change: expected.countAdjustment,
          missing: expected.shrinkage,
          closing: expected.closing,
          counted: expected.wasCounted ? 'Yes' : 'No',
        })
      }
    }
  })

  it('shows money only with the costs key, at the ingredient cost, and leaves an unpriced ingredient blank', async () => {
    const costCalls: string[] = []
    const without = await runExport(input(['reports', 'inventory'], { costCalls }))
    expect(without.sheets[0].columns.map((entry) => entry.id)).not.toEqual(expect.arrayContaining(['used_cost']))
    expect(costCalls).toEqual([])

    const withCosts = await runExport(input(['reports', 'inventory', 'costs'], { costCalls }))
    const rows = records(withCosts.sheets[0])
    expect(costCalls).toEqual(['inventory_costs_for_tenant'])
    expect(rows[1]).toMatchObject({ ingredient: 'Rice', used_cost: 150, wasted_cost: 25, missing_cost: 75 })
    expect(rows[0]).toMatchObject({ ingredient: 'Eggs', used_cost: null, wasted_cost: null, missing_cost: null })
    expect(withCosts.sheets[0].notes.join(' ')).toMatch(/cost today/)
  })

  it('is refused without the inventory key', async () => {
    await expect(runExport(input(['reports']))).rejects.toThrow(/Nothing to export/)
  })

  it('previews a quiet period whole, so the row count is exact', async () => {
    const preview = await previewExport(input(['reports', 'inventory']))
    expect(preview.sheets[0].rows).toBe(3)
    expect(preview.sheets[0].peek.length).toBeLessThanOrEqual(5)
    expect(preview.sheets[0].columns).toContain('Missing')
  })

  it('previews a busy period by its first active day only, and says so', async () => {
    // Nothing on day one; day two is busier than a preview adds up.
    const busy = Array.from({ length: PREVIEW_FULL_USAGE_MOVEMENTS + 1 }, (_, index) =>
      move('i1', 'sale', -1, 10_000 - index - 1, AT(D2, 8 + Math.floor(index / 300), index % 60)),
    ).sort((a, b) => a.created_at.localeCompare(b.created_at))
    // Balances must follow the order the rows happened in.
    busy.forEach((row, index) => {
      row.balance_after = 10_000 - index - 1
    })
    const preview = await previewExport(input(['reports', 'inventory'], { ledger: busy, maxRows: undefined }))
    const [sheet] = preview.sheets
    expect(sheet.rows).toBeNull()
    expect(sheet.peek).toHaveLength(1)
    expect(sheet.peek[0].slice(0, 2)).toEqual([D2, 'Rice'])
    expect(sheet.notes.join(' ')).toMatch(/first day with stock activity/)

    const file = await runExport(input(['reports', 'inventory'], { ledger: busy, maxRows: undefined }))
    expect(records(file.sheets[0])).toEqual([expect.objectContaining({ day: D2, opening: 10_000, used: busy.length, closing: 10_000 - busy.length })])
  })

  it('refuses a period with more stock activity than one file adds up, in the preview and the file', async () => {
    const flood = Array.from({ length: MAX_USAGE_MOVEMENTS + 1 }, (_, index) => move('i1', 'sale', -1, 100_000 - index, AT(D1, 8 + (index % 12), index % 60)))
    await expect(previewExport(input(['reports', 'inventory'], { ledger: flood, maxRows: undefined }))).rejects.toThrow(/too much stock activity/)
    await expect(runExport(input(['reports', 'inventory'], { ledger: flood, maxRows: undefined }))).rejects.toThrow(/too much stock activity/)
  })
})
