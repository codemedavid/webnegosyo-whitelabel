/** @jest-environment node */
/**
 * run_saved_report: Owl finds a format the store saved and runs it for the
 * dates asked. It lists names when none was given, never saves or removes
 * one, and a custom report's card is what offers "Save to My formats".
 */
import { ASSISTANT_TOOLS } from '@/lib/assistant/tools'
import { buildCustomReportResult } from '@/lib/assistant/tools/reads/custom-report'
import { runSavedReportTool, savedFormatFacts } from '@/lib/assistant/tools/reads/saved-report'
import { availableTools } from '@/lib/assistant/tools/registry'
import { EXPORT_SHEETS, visibleColumns } from '@/lib/exports/catalogue'
import { applyFormatTab, reportFormatSpecSchema } from '@/lib/exports/report-format'
import { applyCustomSpec, customReportSpecSchema } from '@/lib/exports/custom-report'
import { ExportError } from '@/lib/exports/errors'
import { templateActionSchema, type ReportTemplate } from '@/lib/exports/report-templates'
import { exportQuerySchema } from '@/lib/exports/request-schema'
import type { ExportResult } from '@/lib/exports/run-export'

const mockList = jest.fn()
const mockLoad = jest.fn()
const mockRun = jest.fn()
const mockRunFormat = jest.fn()

jest.mock('server-only', () => ({}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/assistant/data/cutoff-schedule', () => ({ cutoffScheduleFor: () => Promise.resolve([]) }))
jest.mock('@/lib/exports/server/report-templates', () => ({ listReportTemplates: (...args: unknown[]) => mockList(...args) }))
jest.mock('@/lib/exports/server/load-export-input', () => ({ loadExportInput: (...args: unknown[]) => mockLoad(...args) }))
jest.mock('@/lib/exports/run-custom-export', () => ({ runCustomExport: (...args: unknown[]) => mockRun(...args) }))
jest.mock('@/lib/exports/run-format-export', () => ({ runFormatExport: (...args: unknown[]) => mockRunFormat(...args) }))

const TENANT = '72a2d4c2-a1b7-4afe-a2a2-04ab74c094d2'
const everyone = { has: () => true }
const header = { storeName: 'Shop', periodLabel: '2026-11-02 to 2026-11-08', branchLabel: 'Whole store', asOf: '2026-11-14 09:00 (Manila time)' }
const spec = customReportSpecSchema.parse({ title: 'Average order per day', sheet: 'sales_by_day', columns: [{ id: 'day' }, { id: 'aov', header: 'Avg ticket' }], sort: { column: 'aov', descending: true } })
const weekly: ReportTemplate = { id: 'bbbbbbbb-0000-4000-8000-000000000001', name: 'Weekly owner report', kind: 'custom', spec, savedBy: 'Ana', savedAt: '2026-11-14T02:00:00Z' }
const dishes: ReportTemplate = { ...weekly, kind: 'custom', id: 'bbbbbbbb-0000-4000-8000-000000000002', name: 'Top dishes', spec: customReportSpecSchema.parse({ title: 'Top dishes', sheet: 'items', columns: [{ id: 'name' }, { id: 'net' }], top: 10 }) }

function result(): ExportResult {
  const sheet = EXPORT_SHEETS.sales_by_day
  const columns = visibleColumns(sheet, everyone)
  const row = (day: string, aov: number) => columns.map((column) => (column.id === 'day' ? day : column.id === 'aov' ? aov : 0))
  const built = { id: 'sales_by_day' as const, name: sheet.name, columns, rows: [row('2026-11-02', 310), row('2026-11-03', 420)], notes: [] }
  return { header, leftOut: [], sheets: [applyCustomSpec(built, spec)] } as unknown as ExportResult
}

const ctx = { tenantId: TENANT } as never
const run = (args: Record<string, unknown>) => runSavedReportTool.run(ctx, runSavedReportTool.input.parse(args))

beforeEach(() => {
  jest.clearAllMocks()
  mockList.mockResolvedValue([weekly, dishes])
  mockLoad.mockResolvedValue({ kind: 'ready', userId: 'user-1', input: { access: everyone, context: { isMultiBranch: false } } })
  mockRun.mockResolvedValue(result())
})

describe('run_saved_report', () => {
  it('lists the saved formats when no name was given, and reads no figures', async () => {
    const answer = await run({})
    expect(answer.facts).toMatchObject({
      ready: false,
      savedFormats: [
        { name: 'Weekly owner report', madeOf: 'Sales by day · Day, Avg ticket · highest Avg ticket first' },
        { name: 'Top dishes', madeOf: 'Items sold · Item, Sales · first 10' },
      ],
    })
    expect(answer.card).toBeUndefined()
    expect(mockLoad).not.toHaveBeenCalled()
    expect(mockRun).not.toHaveBeenCalled()
  })

  it('runs the format the owner named, for the dates asked, with the STORED spec', async () => {
    const answer = await run({ name: 'my weekly report', from: '2026-11-02', to: '2026-11-08' })
    expect(mockLoad).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT, sheets: ['sales_by_day'], period: { preset: 'custom', from: '2026-11-02', to: '2026-11-08' }, source: 'owl' }))
    expect(mockRun.mock.calls[0][1]).toBe(spec)
    // Named as the owner saved it, not by the tab's title ("Average order per day").
    expect(answer.facts).toMatchObject({ ready: true, title: 'Weekly owner report', savedFormat: 'Weekly owner report', rows: 2, columns: ['Day', 'Avg ticket'] })
    expect(answer.card).toMatchObject({ type: 'file', title: 'Weekly owner report' })
    expect(answer.facts.firstRows).toEqual([
      { Day: '2026-11-03', 'Avg ticket': 420 },
      { Day: '2026-11-02', 'Avg ticket': 310 },
    ])
    if (answer.card?.type !== 'file') throw new Error('expected a file card')
    // Already saved: the card offers no Save, and the model is not told to offer one.
    expect(answer.card.save).toBeUndefined()
    expect(answer.facts.keep).toBeUndefined()
    for (const download of answer.card.downloads) {
      const parsed = exportQuerySchema.safeParse(Object.fromEntries(new URLSearchParams(download.href.split('?')[1])))
      expect(parsed.success && parsed.data.custom).toEqual(spec)
    }
  })

  it('names what is saved when the name matches nothing, or more than one', async () => {
    for (const name of ['payroll', 'report']) {
      const answer = await run({ name })
      expect(answer.facts).toMatchObject({ ready: false, savedFormats: [{ name: 'Weekly owner report' }, { name: 'Top dishes' }] })
      expect(mockRun).not.toHaveBeenCalled()
    }
  })

  it('says so when the store has saved none, or the list could not be read', async () => {
    mockList.mockResolvedValue([])
    expect((await run({ name: 'weekly' })).facts).toMatchObject({ ready: false, reason: 'This store has no saved formats yet.' })
    mockList.mockRejectedValue(new Error('timeout'))
    expect((await run({})).facts).toMatchObject({ ready: false, reason: expect.stringMatching(/could not be read/) })
  })

  it('passes on the engine’s refusal when this account may not have the sheet or a column', async () => {
    mockRun.mockRejectedValue(new ExportError('Sales by day has no column called "aov" for this account. It has: day.', 400))
    expect((await run({ name: 'weekly' })).facts).toMatchObject({ ready: false, reason: expect.stringMatching(/no column called "aov"/) })
    mockLoad.mockResolvedValue({ kind: 'refused', reason: 'no_permission' })
    expect((await run({ name: 'weekly' })).facts).toMatchObject({ ready: false, reason: expect.stringMatching(/Reports permission/) })
  })

  it('hands the model names and shapes only', () => {
    expect(savedFormatFacts([weekly])).toEqual([{ name: 'Weekly owner report', madeOf: 'Sales by day · Day, Avg ticket · highest Avg ticket first' }])
  })
})

describe('a saved layout (the owner’s own format)', () => {
  const layoutSpec = reportFormatSpecSchema.parse({
    tabs: [
      { title: 'Benta', sheet: 'sales_by_day', columns: [{ header: 'Petsa', id: 'day' }, { header: 'Upa', id: null }, { header: 'Karaniwan', id: 'aov' }] },
      { title: 'Mga order', sheet: 'orders', columns: [{ header: 'Resibo', id: 'order_no' }] },
    ],
  })
  const monthly: ReportTemplate = { id: 'bbbbbbbb-0000-4000-8000-000000000003', name: 'Monthly para kay Ate', kind: 'format', spec: layoutSpec, savedBy: null, savedAt: '2026-11-14T02:00:00Z' }

  function laidOut(): ExportResult {
    const days = EXPORT_SHEETS.sales_by_day
    const columns = visibleColumns(days, everyone)
    const row = (day: string, aov: number) => columns.map((column) => (column.id === 'day' ? day : column.id === 'aov' ? aov : 0))
    const built = { id: 'sales_by_day' as const, name: days.name, columns, rows: [row('2026-11-02', 310), row('2026-11-03', 420)], notes: [] }
    const orders = { id: 'orders', name: 'Mga order', columns: [{ id: 'order_no', header: 'Resibo', kind: 'text' as const }], rows: [['A-1'], ['A-2'], ['A-3']], notes: [] }
    return { header, leftOut: [], title: 'Monthly para kay Ate', sheets: [applyFormatTab(built, layoutSpec.tabs[0]), orders] } as unknown as ExportResult
  }

  beforeEach(() => {
    mockList.mockResolvedValue([weekly, monthly])
    mockRunFormat.mockResolvedValue(laidOut())
  })

  it('is listed with what it is made of', async () => {
    const answer = await run({})
    expect((answer.facts.savedFormats as Array<{ name: string; madeOf: string }>)[1]).toEqual({
      name: 'Monthly para kay Ate',
      madeOf: 'Your format · 2 tabs · Benta (Sales by day), Mga order (Orders) · 1 column left blank',
    })
  })

  it('reads every sheet its tabs need and links the file by the format’s id', async () => {
    const answer = await run({ name: 'monthly para kay ate', from: '2026-11-02', to: '2026-11-08' })
    expect(mockLoad).toHaveBeenCalledWith(expect.objectContaining({ sheets: ['sales_by_day', 'orders'] }))
    expect(mockRunFormat.mock.calls[0].slice(1)).toEqual([layoutSpec, 'Monthly para kay Ate'])
    expect(mockRun).not.toHaveBeenCalled()
    if (answer.card?.type !== 'file') throw new Error('expected a file card')
    expect(answer.card).toMatchObject({ title: 'Monthly para kay Ate', sheets: [{ name: 'Benta', rows: 2 }, { name: 'Mga order', rows: 3 }], notes: ['Left blank (the store has no figure for it): Upa.'] })
    expect(answer.card.save).toBeUndefined()
    const query = new URLSearchParams(answer.card.downloads[0].href.split('?')[1])
    expect(Object.fromEntries(query)).toMatchObject({ sheets: 'sales_by_day,orders', template: monthly.id, from: '2026-11-02', to: '2026-11-08', source: 'owl' })
    expect(query.has('custom')).toBe(false)
  })

  it('lets the model read the totals tab, never the tab that lists orders', async () => {
    const { facts } = await run({ name: 'Monthly para kay Ate' })
    expect(facts).toMatchObject({
      ready: true,
      savedFormat: 'Monthly para kay Ate',
      leftBlank: ['Upa'],
      firstRowsOf: 'Benta',
      firstRows: [{ Petsa: '2026-11-02', Upa: null, Karaniwan: 310 }, { Petsa: '2026-11-03', Upa: null, Karaniwan: 420 }],
    })
    expect(JSON.stringify(facts)).not.toContain('A-1')
  })
})

describe('a custom report’s card offers Save to My formats', () => {
  it('carries exactly what the formats route accepts', () => {
    const request = { tenantId: TENANT, period: { preset: 'custom' as const, from: '2026-11-02', to: '2026-11-08' }, branch: null, format: 'xlsx' as const }
    const answer = buildCustomReportResult(result(), spec, request, '/reports/export')
    if (answer.card?.type !== 'file') throw new Error('expected a file card')
    expect(answer.card.save).toEqual({ tenantId: TENANT, name: 'Average order per day', spec })
    expect(templateActionSchema.safeParse({ action: 'save', ...answer.card.save }).success).toBe(true)
    expect(answer.facts.keep).toMatch(/Save to My formats/)
  })
})

describe('who gets the tool', () => {
  const flags = { inventoryEnabled: false, customerHubOn: false, menuEngineeringEnabled: false, isPlatformOrders: true }
  const staff = (permissions: string[]) => ({ role: 'admin', tenant_id: TENANT, is_owner: false, permissions, outlet_id: null }) as never
  const names = (caller: never, tenantFlags = flags) => availableTools(ASSISTANT_TOOLS, caller, tenantFlags).map((tool) => tool.name)

  it('needs the Reports key and a store whose orders are on the platform database', () => {
    expect(names(staff(['assistant', 'reports']))).toContain('run_saved_report')
    expect(names(staff(['assistant', 'orders']))).not.toContain('run_saved_report')
    expect(names(staff(['assistant', 'reports']), { ...flags, isPlatformOrders: false })).not.toContain('run_saved_report')
  })

  it('is appended after every older tool, and no tool saves, renames or removes a format', () => {
    expect(ASSISTANT_TOOLS[ASSISTANT_TOOLS.length - 2].name).toBe(runSavedReportTool.name)
    // follow_report_format lays a report out and hands the layout to the card; keeping it is the owner's tap.
    expect(ASSISTANT_TOOLS.map((tool) => tool.name).filter((name) => /format|template/.test(name))).toEqual(['follow_report_format'])
    expect(ASSISTANT_TOOLS.map((tool) => tool.name).filter((name) => /^(save|rename|remove|delete)_/.test(name))).toEqual([])
  })
})
