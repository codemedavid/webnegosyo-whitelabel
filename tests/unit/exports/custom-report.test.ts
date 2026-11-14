/**
 * A custom report: one sheet, reshaped. The spec never holds a figure, a link
 * can carry it, and whatever a link carries is checked again.
 */
import { applyCustomSpec, customReportSpecSchema, decodeCustomSpec, encodeCustomSpec, MAX_CUSTOM_PARAM_LENGTH, type CustomReportSpec } from '@/lib/exports/custom-report'
import { exportHref, exportQuerySchema, exportRequestSchema } from '@/lib/exports/request-schema'
import type { BuiltSheet } from '@/lib/exports/types'

const TENANT = '72a2d4c2-a1b7-4afe-a2a2-04ab74c094d2'

const byDay: BuiltSheet = {
  id: 'sales_by_day',
  name: 'Sales by day',
  columns: [
    { id: 'day', header: 'Day', kind: 'text' },
    { id: 'weekday', header: 'Weekday', kind: 'text' },
    { id: 'orders', header: 'Orders', kind: 'count' },
    { id: 'net', header: 'Sales', kind: 'money' },
    { id: 'aov', header: 'Average order', kind: 'money' },
  ],
  rows: [
    ['2026-11-01', 'Sunday', 40, 12000, 300],
    ['2026-11-02', 'Monday', 10, 2500, 250],
    ['2026-11-03', 'Tuesday', 0, 0, null],
    ['2026-11-04', 'Wednesday', 22, 9900, 450],
    ['2026-11-05', 'Thursday', 22, 4400, 200],
  ],
  notes: ['Cancelled orders are not counted.'],
}

function spec(overrides: Record<string, unknown> = {}): CustomReportSpec {
  return customReportSpecSchema.parse({ title: 'Average order per day', sheet: 'sales_by_day', columns: [{ id: 'day' }, { id: 'aov' }], ...overrides })
}

describe('applyCustomSpec', () => {
  it('keeps the chosen columns in the chosen order under the chosen headings, and nothing else', () => {
    const shaped = applyCustomSpec(byDay, spec({ columns: [{ id: 'aov', header: 'Avg ticket' }, { id: 'day' }] }))
    expect(shaped.name).toBe('Average order per day')
    expect(shaped.id).toBe('sales_by_day')
    expect(shaped.columns.map((column) => [column.id, column.header, column.kind])).toEqual([
      ['aov', 'Avg ticket', 'money'],
      ['day', 'Day', 'text'],
    ])
    expect(shaped.rows).toEqual([
      [300, '2026-11-01'],
      [250, '2026-11-02'],
      [null, '2026-11-03'],
      [450, '2026-11-04'],
      [200, '2026-11-05'],
    ])
    expect(shaped.notes).toEqual(['Made from the Sales by day sheet.', 'Cancelled orders are not counted.'])
  })

  it('sorts numbers by size with blanks last either way, and ties keep the sheet order', () => {
    const down = applyCustomSpec(byDay, spec({ sort: { column: 'aov', descending: true } }))
    expect(down.rows.map((row) => row[1])).toEqual([450, 300, 250, 200, null])
    const up = applyCustomSpec(byDay, spec({ sort: { column: 'aov' } }))
    expect(up.rows.map((row) => row[1])).toEqual([200, 250, 300, 450, null])
    const tied = applyCustomSpec(byDay, spec({ sort: { column: 'orders', descending: true } }))
    expect(tied.rows.map((row) => row[0])).toEqual(['2026-11-01', '2026-11-04', '2026-11-05', '2026-11-02', '2026-11-03'])
  })

  it('keeps the top N after sorting and says how many there were', () => {
    const shaped = applyCustomSpec(byDay, spec({ sort: { column: 'net', descending: true }, top: 2 }))
    expect(shaped.rows.map((row) => row[0])).toEqual(['2026-11-01', '2026-11-04'])
    expect(shaped.notes).toContain('Sorted by Sales, highest first.')
    expect(shaped.notes).toContain('The first 2 of 5 rows.')
  })

  it.each([
    [{ column: 'weekday', op: 'is', value: 'monday' }, ['2026-11-02']],
    [{ column: 'weekday', op: 'is_not', value: 'Monday' }, ['2026-11-01', '2026-11-03', '2026-11-04', '2026-11-05']],
    [{ column: 'weekday', op: 'contains', value: 'nes' }, ['2026-11-04']],
    [{ column: 'net', op: 'at_least', value: 9900 }, ['2026-11-01', '2026-11-04']],
    [{ column: 'net', op: 'at_most', value: '2,500' }, ['2026-11-02', '2026-11-03']],
    // A blank is not "at most" anything: a day with no orders has no average.
    [{ column: 'aov', op: 'at_most', value: 250 }, ['2026-11-02', '2026-11-05']],
    // Days compare as words, which is the calendar for YYYY-MM-DD.
    [{ column: 'day', op: 'at_least', value: '2026-11-04' }, ['2026-11-04', '2026-11-05']],
    [{ column: 'orders', op: 'is', value: '22' }, ['2026-11-04', '2026-11-05']],
  ] as const)('filter %j keeps %j', (filter, days) => {
    const shaped = applyCustomSpec(byDay, spec({ filters: [filter] }))
    expect(shaped.rows.map((row) => row[0])).toEqual(days)
  })

  it('filters and sorts on columns it does not show', () => {
    const shaped = applyCustomSpec(byDay, spec({ columns: [{ id: 'day' }], filters: [{ column: 'orders', op: 'at_least', value: 20 }], sort: { column: 'net', descending: true } }))
    expect(shaped.rows).toEqual([['2026-11-01'], ['2026-11-04'], ['2026-11-05']])
    expect(shaped.notes).toContain('Only rows where Orders is at least 20.')
  })

  it('reads a cell that carries its own kind (the Summary sheet) by its value', () => {
    const summary: BuiltSheet = {
      id: 'summary',
      name: 'Summary',
      columns: [
        { id: 'line', header: 'Line', kind: 'text' },
        { id: 'value', header: 'Value', kind: 'money' },
      ],
      rows: [
        ['Orders', { value: 44, kind: 'count' }],
        ['Sales', { value: 12133.18, kind: 'money' }],
      ],
      notes: [],
    }
    const shaped = applyCustomSpec(summary, spec({ sheet: 'summary', columns: [{ id: 'line' }, { id: 'value' }], sort: { column: 'value', descending: true } }))
    expect(shaped.rows.map((row) => row[0])).toEqual(['Sales', 'Orders'])
  })

  it('refuses a column the sheet does not have for this account, naming the ones it has', () => {
    // An account without the costs key gets a sheet with no cost column at all.
    expect(() => applyCustomSpec(byDay, spec({ columns: [{ id: 'day' }, { id: 'unit_cost' }] }))).toThrow(/no column called "unit_cost".*It has: day, weekday, orders, net, aov/)
    expect(() => applyCustomSpec(byDay, spec({ sort: { column: 'profit' } }))).toThrow(/"profit"/)
    expect(() => applyCustomSpec(byDay, spec({ filters: [{ column: 'cashier', op: 'is', value: 'Ana' }] }))).toThrow(/"cashier"/)
  })
})

describe('the spec', () => {
  it.each([
    ['a title that would run as a formula', { title: '=HYPERLINK("http://x")' }],
    ['a title Excel cannot use as a tab name', { title: 'Sales / day' }],
    ['a title longer than a tab name', { title: 'x'.repeat(32) }],
    ['a heading that starts a formula', { columns: [{ id: 'day', header: '+1' }] }],
    ['the same column twice', { columns: [{ id: 'day' }, { id: 'day' }] }],
    ['no columns', { columns: [] }],
    ['an unknown sheet', { sheet: 'passwords' }],
    ['an unknown filter', { filters: [{ column: 'day', op: 'matches', value: '.*' }] }],
    ['a column id that is not an id', { columns: [{ id: 'day; drop table' }] }],
    ['more rows than a top may keep', { top: 100_000 }],
    ['a field nobody defined', { formula: 'SUM(A:A)' }],
  ])('refuses %s', (_what, overrides) => {
    expect(customReportSpecSchema.safeParse({ title: 'Report', sheet: 'sales_by_day', columns: [{ id: 'day' }], ...overrides }).success).toBe(false)
  })

  it('rides in a link and comes back the same', () => {
    const original = spec({ title: 'Benta kada araw ñ', filters: [{ column: 'weekday', op: 'is', value: 'Sábado' }], sort: { column: 'net', descending: true }, top: 20 })
    const encoded = encodeCustomSpec(original)
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeCustomSpec(encoded)).toEqual(original)
  })

  it('a link that is not a spec is not a spec', () => {
    const encoded = encodeCustomSpec(spec())
    expect(decodeCustomSpec('')).toBeNull()
    expect(decodeCustomSpec('not base64 at all!')).toBeNull()
    expect(decodeCustomSpec(encoded.slice(0, -6))).toBeNull()
    expect(decodeCustomSpec('A'.repeat(MAX_CUSTOM_PARAM_LENGTH + 1))).toBeNull()
    // Valid JSON, wrong shape: an extra field is refused, never ignored.
    const tampered = btoa(JSON.stringify({ ...spec(), sheet: 'orders', admin: true })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(decodeCustomSpec(tampered)).toBeNull()
  })

  it('the download link carries it, and the route reads the same request back', () => {
    const custom = spec({ sort: { column: 'aov', descending: true } })
    const href = exportHref({ tenantId: TENANT, sheets: ['sales_by_day'], period: { preset: 'custom', from: '2026-11-01', to: '2026-11-14' }, branch: null, format: 'xlsx', source: 'owl', custom })
    expect(href.startsWith('/api/exports?')).toBe(true)
    expect(href.includes('//')).toBe(false)
    const parsed = exportQuerySchema.safeParse(Object.fromEntries(new URLSearchParams(href.split('?')[1])))
    expect(parsed.success && parsed.data).toMatchObject({ sheets: ['sales_by_day'], custom, source: 'owl', mode: 'file' })
  })

  it('a custom report is made from its one sheet: a link that asks for more is refused', () => {
    const custom = spec()
    const base = { tenantId: TENANT, period: { preset: 'today' }, custom }
    expect(exportRequestSchema.safeParse({ ...base, sheets: ['sales_by_day'] }).success).toBe(true)
    expect(exportRequestSchema.safeParse({ ...base, sheets: ['orders'] }).success).toBe(false)
    expect(exportRequestSchema.safeParse({ ...base, sheets: ['sales_by_day', 'orders'] }).success).toBe(false)
    const query = { tenantId: TENANT, sheets: 'sales_by_day', period: 'today', custom: 'AAAA' }
    expect(exportQuerySchema.safeParse(query).success).toBe(false)
  })
})
