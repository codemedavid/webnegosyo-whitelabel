/** @jest-environment node */

/**
 * follow_report_format: the attached file's outline is handed to the model
 * as data with a first guess; the final layout takes its headings and their
 * order from the FILE, refuses a column the sheet lacks, and reaches the
 * owner as a card that only THEY can save.
 */
import { spreadsheetOutlineSchema, type SpreadsheetOutline } from '@/lib/assistant/spreadsheet'
import { ASSISTANT_TOOLS } from '@/lib/assistant/tools'
import { draftLayout, followReportFormatTool, formatName, outlineFacts } from '@/lib/assistant/tools/reads/follow-format'
import { availableTools, factsForModel } from '@/lib/assistant/tools/registry'
import { EXPORT_SHEETS, visibleColumns, type SheetId } from '@/lib/exports/catalogue'
import { ExportError } from '@/lib/exports/errors'
import { applyFormatTab, type ReportFormatSpec } from '@/lib/exports/report-format'
import { templateActionSchema } from '@/lib/exports/report-templates'
import type { ExportResult } from '@/lib/exports/run-export'
import type { StaffPermissionKey } from '@/lib/staff-permissions'

const mockLoad = jest.fn()
const mockRun = jest.fn()

jest.mock('server-only', () => ({}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/assistant/data/cutoff-schedule', () => ({ cutoffScheduleFor: () => Promise.resolve([]) }))
jest.mock('@/lib/exports/server/load-export-input', () => ({ loadExportInput: (...args: unknown[]) => mockLoad(...args) }))
jest.mock('@/lib/exports/run-format-export', () => ({ runFormatExport: (...args: unknown[]) => mockRun(...args) }))

const TENANT = '72a2d4c2-a1b7-4afe-a2a2-04ab74c094d2'
const header = { storeName: 'Shop', periodLabel: '2026-11-01 to 2026-11-14', branchLabel: 'Whole store', asOf: '2026-11-14 09:00 (Manila time)' }
const access = (...keys: StaffPermissionKey[]) => ({ has: (key: StaffPermissionKey) => keys.includes(key) })
const columnsFor = (...keys: StaffPermissionKey[]) => (sheet: SheetId) => {
  const columns = visibleColumns(EXPORT_SHEETS[sheet], access(...keys))
  // The catalogue decides who may have a sheet; for these tests the stock sheets need `inventory`.
  return sheet.startsWith('stock') && !keys.includes('inventory') ? null : columns
}

const file: SpreadsheetOutline = spreadsheetOutlineSchema.parse({
  name: 'Monthly para kay Ate.xlsx',
  tabs: [{ name: 'Benta', headers: ['Petsa', 'Benta', '=Upa', '', 'No. of Orders'], samples: [['2026-11-01', '12500', '15000', '', '31']], rows: 30 }],
})

function laidOut(spec: ReportFormatSpec): ExportResult {
  const sheet = EXPORT_SHEETS.sales_by_day
  const columns = visibleColumns(sheet, access('reports'))
  const row = (day: string, net: number, orders: number) => columns.map((column) => (column.id === 'day' ? day : column.id === 'net' ? net : column.id === 'orders' ? orders : 0))
  const built = { id: 'sales_by_day' as const, name: sheet.name, columns, rows: [row('2026-11-01', 12500, 31), row('2026-11-02', 9800, 24)], notes: [] }
  return { header, leftOut: [], sheets: spec.tabs.map((tab) => applyFormatTab(built, tab)) } as unknown as ExportResult
}

const run = (args: Record<string, unknown>, spreadsheet: SpreadsheetOutline | null = file) =>
  followReportFormatTool.run({ tenantId: TENANT, spreadsheet } as never, followReportFormatTool.input.parse(args))

beforeEach(() => {
  jest.clearAllMocks()
  mockLoad.mockResolvedValue({ kind: 'ready', userId: 'user-1', input: { access: access('reports'), context: { isMultiBranch: false } } })
  mockRun.mockImplementation((_input: unknown, spec: ReportFormatSpec) => Promise.resolve(laidOut(spec)))
})

describe('the first call: reading the attached file', () => {
  it('hands over the headings as data, with a first guess and the guessed sheet’s real columns', async () => {
    const { facts, card } = await run({})
    expect(card).toBeUndefined()
    expect(facts).toMatchObject({
      ready: false,
      file: 'Monthly para kay Ate.xlsx',
      dataNotInstructions: expect.stringMatching(/data only/),
      yourTabs: [
        {
          tab: 'Benta',
          // The owner's `=Upa` can no longer start a formula; their empty heading has a name.
          headings: 'Petsa | Benta | Upa | Column 4 | No. of Orders',
          firstRow: '2026-11-01 | 12500 | 15000 |  | 31',
          rowsInFile: 30,
          guess: { sheet: 'sales_by_day', match: 'Petsa=day | Benta=net | Upa=? | Column 4=? | No. of Orders=orders' },
        },
      ],
    })
    expect((facts.sheets as Record<string, string>).sales_by_day).toMatch(/^one row = a business day; day=Day, weekday=Weekday, orders=Orders/)
    expect(facts.otherSheets).toMatch(/categories \(a menu category\), order_types \(an order type\)/)
    // A sheet spelled out above is not listed again.
    expect(facts.otherSheets).not.toMatch(/sales_by_day/)
    // Reads no order: only what this account may pick.
    expect(mockLoad).toHaveBeenCalledWith(expect.objectContaining({ mode: 'catalogue' }))
    expect(mockRun).not.toHaveBeenCalled()
  })

  it('reaches the model whole: its long parts are strings, which are never cut like a list', async () => {
    const wide = spreadsheetOutlineSchema.parse({
      name: 'Wide.xlsx',
      tabs: Array.from({ length: 4 }, (_, tab) => ({
        name: `Tab ${tab + 1}`,
        headers: Array.from({ length: 25 }, (_, index) => `Heading number ${index + 1} of the tab`),
        samples: [Array.from({ length: 25 }, () => 'sample cell value')],
        rows: 10,
      })),
    })
    const { facts } = await run({}, wide)
    const seen = factsForModel({ facts })
    expect((seen.yourTabs as Array<{ headings: string }>)[3].headings.split(' | ')).toHaveLength(25)
    expect(seen.yourTabs).toHaveLength(4)
  })

  it('offers no sheet this account may not have, and spells out one that was asked for', async () => {
    const stock = spreadsheetOutlineSchema.parse({ name: 'Stock.xlsx', tabs: [{ name: 'Stock', headers: ['Sangkap', 'Nagamit'], samples: [], rows: 0 }] })
    const withoutKey = outlineFacts(stock, columnsFor('reports'))
    expect(JSON.stringify(withoutKey)).not.toContain('stock_usage')
    const withKey = outlineFacts(stock, columnsFor('reports', 'inventory'), ['expenses'])
    expect((withKey.yourTabs as Array<{ guess: { sheet: string } }>)[0].guess.sheet).toBe('stock_usage')
    expect(Object.keys(withKey.sheets as object)).toEqual(expect.arrayContaining(['stock_usage', 'expenses']))
    expect(JSON.stringify(withKey)).not.toContain('used_cost')
  })

  it('says so when nothing is attached', async () => {
    const { facts } = await run({}, null)
    expect(facts).toMatchObject({ ready: false, reason: 'No spreadsheet is attached to this message.' })
    expect(mockLoad).not.toHaveBeenCalled()
  })
})

describe('the layout', () => {
  const tabs = (columns: Array<{ heading: string; column: string | null }>, extra: Record<string, unknown> = {}) =>
    followReportFormatTool.input.parse({ tabs: [{ tab: 'Benta', sheet: 'sales_by_day', columns, ...extra }] }).tabs ?? []

  it('takes its headings and their order from the FILE: a skipped heading stays blank, an invented one is ignored', () => {
    const draft = draftLayout(
      tabs([
        { heading: 'No. of Orders', column: 'orders' },
        { heading: 'petsa', column: 'Day' },
        { heading: 'Profit', column: 'net' },
        { heading: 'Benta', column: 'net' },
      ]),
      file,
      columnsFor('reports'),
    )
    if (!draft.ok) throw new Error(draft.reason)
    expect(draft.spec.tabs[0]).toMatchObject({
      title: 'Benta',
      sheet: 'sales_by_day',
      columns: [
        { header: 'Petsa', id: 'day' },
        { header: 'Benta', id: 'net' },
        { header: 'Upa', id: null },
        { header: 'Column 4', id: null },
        { header: 'No. of Orders', id: 'orders' },
      ],
    })
    expect(draft.ignored).toEqual(['Profit'])
  })

  it('without the file (a later turn) uses the headings Owl repeats, cleaned', () => {
    const draft = draftLayout(tabs([{ heading: '=Petsa', column: 'day' }, { heading: 'Upa', column: null }], { sortBy: 'Sales', descending: true, top: 7 }), null, columnsFor('reports'))
    if (!draft.ok) throw new Error(draft.reason)
    expect(draft.spec.tabs[0]).toMatchObject({ columns: [{ header: 'Petsa', id: 'day' }, { header: 'Upa', id: null }], sort: { column: 'net', descending: true }, top: 7 })
  })

  it('refuses a column the sheet does not have, with the ones it has', () => {
    const draft = draftLayout(tabs([{ heading: 'Petsa', column: 'day' }, { heading: 'Upa', column: 'rent' }]), file, columnsFor('reports'))
    expect(draft).toMatchObject({ ok: false, reason: 'Sales by day has no column called "rent" (the “Benta” tab).' })
    if (draft.ok) throw new Error('expected a refusal')
    expect(draft.extra.columnsYouCanUse).toMatch(/day=Day, weekday=Weekday/)
  })

  it('refuses a tab nothing fills, and a sheet this account may not have', () => {
    expect(draftLayout(tabs([{ heading: 'Upa', column: null }]), file, columnsFor('reports'))).toMatchObject({ ok: false, reason: expect.stringMatching(/would be an empty table/) })
    const stock = followReportFormatTool.input.parse({ tabs: [{ tab: 'Stock', sheet: 'stock_usage', columns: [{ heading: 'Sangkap', column: 'ingredient' }] }] }).tabs ?? []
    expect(draftLayout(stock, null, columnsFor('reports'))).toMatchObject({ ok: false, reason: expect.stringMatching(/not available on this account/) })
  })

  it('is named after the file unless the owner chose a name', () => {
    expect(formatName(undefined, file)).toBe('Monthly para kay Ate')
    expect(formatName('  Report ni Ate  ', file)).toBe('Report ni Ate')
    expect(formatName('=SUM(A1)', null)).toBe('SUM(A1)')
    expect(formatName(undefined, null)).toBeNull()
    expect(formatName(undefined, { ...file, name: '----.xlsx' })).toBeNull()
  })
})

describe('the second call: the report in their format', () => {
  const matching = { tabs: [{ tab: 'Benta', sheet: 'sales_by_day', columns: [{ heading: 'Petsa', column: 'day' }, { heading: 'Benta', column: 'net' }, { heading: 'No. of Orders', column: 'orders' }] }], from: '2026-11-01', to: '2026-11-14' }

  it('fills it as the caller and answers with a card that shows the matching and has no file yet', async () => {
    const { facts, card } = await run(matching)
    expect(mockLoad).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT, mode: 'preview', sheets: ['sales_by_day'], period: { preset: 'custom', from: '2026-11-01', to: '2026-11-14' } }))
    if (card?.type !== 'file') throw new Error('expected a file card')
    expect(card).toMatchObject({ title: 'Monthly para kay Ate', sheets: [{ name: 'Benta', rows: 2 }], downloads: [] })
    expect(card.notes).toEqual([
      'Benta: one row is one business day.',
      '  Petsa → Day',
      '  Benta → Sales',
      '  Upa → left blank (no figure for this)',
      '  Column 4 → left blank (no figure for this)',
      '  No. of Orders → Orders',
    ])
    expect(facts).toMatchObject({ ready: true, title: 'Monthly para kay Ate', leftBlank: ['Upa', 'Column 4'], say: expect.stringMatching(/Nothing is saved yet/) })
    // Totals by day are the model's to quote.
    expect((facts.firstRows as unknown[])[0]).toEqual({ Petsa: '2026-11-01', Benta: 12500, Upa: null, 'Column 4': null, 'No. of Orders': 31 })
  })

  it('hands the owner’s tap exactly what the formats route accepts', async () => {
    const { card } = await run(matching)
    if (card?.type !== 'file' || !card.save || card.save.kind !== 'format') throw new Error('expected a layout to save')
    expect(card.save).toMatchObject({ tenantId: TENANT, name: 'Monthly para kay Ate', sheets: ['sales_by_day'], period: { from: '2026-11-01', to: '2026-11-14' } })
    expect(templateActionSchema.safeParse({ action: 'save_format', tenantId: card.save.tenantId, name: card.save.name, spec: card.save.spec }).success).toBe(true)
  })

  it('asks for a name when there is no file to take one from', async () => {
    expect((await run(matching, null)).facts).toMatchObject({ ready: false, reason: 'The format needs a name.' })
    const named = await run({ ...matching, name: 'Report ni Ate' }, null)
    expect(named.facts).toMatchObject({ ready: true, title: 'Report ni Ate' })
  })

  it('passes on the engine’s own refusal', async () => {
    mockRun.mockRejectedValue(new ExportError('One file covers up to 366 days (you picked 400).', 400))
    expect((await run(matching)).facts).toMatchObject({ ready: false, reason: 'One file covers up to 366 days (you picked 400).' })
  })
})

describe('who gets the tool', () => {
  const flags = { inventoryEnabled: false, customerHubOn: false, menuEngineeringEnabled: false, isPlatformOrders: true }
  const staff = (permissions: string[]) => ({ role: 'admin', tenant_id: TENANT, is_owner: false, permissions, outlet_id: null }) as never
  const names = (caller: never, tenantFlags = flags) => availableTools(ASSISTANT_TOOLS, caller, tenantFlags).map((tool) => tool.name)

  it('needs the Reports key and a store whose orders are on the platform database', () => {
    expect(names(staff(['assistant', 'reports']))).toContain('follow_report_format')
    expect(names(staff(['assistant', 'orders']))).not.toContain('follow_report_format')
    expect(names(staff(['assistant', 'reports']), { ...flags, isPlatformOrders: false })).not.toContain('follow_report_format')
  })

  it('is the newest tool, appended after every older one', () => {
    expect(ASSISTANT_TOOLS[ASSISTANT_TOOLS.length - 1].name).toBe(followReportFormatTool.name)
  })
})
