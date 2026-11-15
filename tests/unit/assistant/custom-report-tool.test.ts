/** @jest-environment node */
/**
 * build_custom_report: Owl writes a spec (never a figure), names columns by
 * id or heading, is told the real columns when it guesses wrong, reads rows
 * back only from sheets with no person's details, and the card's link carries
 * the same spec to our own export route.
 */
import { isExportHref } from '@/components/admin/assistant/file-card'
import { ASSISTANT_TOOLS } from '@/lib/assistant/tools'
import { buildCustomReportResult, buildCustomReportTool, draftCustomSpec, SHEETS_OWL_MAY_READ } from '@/lib/assistant/tools/reads/custom-report'
import { availableTools, factsForModel } from '@/lib/assistant/tools/registry'
import { EXPORT_SHEETS, SHEET_IDS, visibleColumns } from '@/lib/exports/catalogue'
import { applyCustomSpec } from '@/lib/exports/custom-report'
import { exportQuerySchema } from '@/lib/exports/request-schema'
import type { ExportResult } from '@/lib/exports/run-export'
import type { BuiltSheet } from '@/lib/exports/types'

jest.mock('server-only', () => ({}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))

const TENANT = '72a2d4c2-a1b7-4afe-a2a2-04ab74c094d2'
const everyone = { has: () => true }
const dayColumns = visibleColumns(EXPORT_SHEETS.sales_by_day, everyone)
const header = { storeName: 'Shop', periodLabel: '2026-11-01 to 2026-11-14 (so far)', branchLabel: 'Whole store', asOf: '2026-11-14 09:00 (Manila time)' }
const request = { tenantId: TENANT, period: { preset: 'custom' as const, from: '2026-11-01', to: '2026-11-14' }, branch: null, format: 'xlsx' as const }

function built(id: 'sales_by_day' | 'orders', rows: BuiltSheet['rows']): BuiltSheet {
  const sheet = EXPORT_SHEETS[id]
  return { id, name: sheet.name, columns: visibleColumns(sheet, everyone), rows, notes: [] }
}

describe('draftCustomSpec', () => {
  it('takes columns by id or by heading, however they were cased', () => {
    const draft = draftCustomSpec(
      { title: 'Average order per day', sheet: 'sales_by_day', columns: ['Day', 'average order', 'net'], rename: [{ column: 'Average Order', as: 'Avg ticket' }], sortBy: 'AOV', descending: true, top: 10 },
      dayColumns,
    )
    expect(draft).toEqual({
      ok: true,
      spec: {
        title: 'Average order per day',
        sheet: 'sales_by_day',
        columns: [{ id: 'day' }, { id: 'aov', header: 'Avg ticket' }, { id: 'net' }],
        filters: [],
        sort: { column: 'aov', descending: true },
        top: 10,
      },
    })
  })

  it('names every column it could not find, wherever it was used', () => {
    const draft = draftCustomSpec({ title: 'Report', sheet: 'sales_by_day', columns: ['day', 'profit'], filters: [{ column: 'cashier', op: 'is', value: 'Ana' }], sortBy: 'margin' }, dayColumns)
    expect(draft).toEqual({ ok: false, reason: 'This sheet has no column called "profit", "cashier", "margin".', unknown: ['profit', 'cashier', 'margin'] })
  })

  it('asks for columns when none were named, and refuses a title that cannot be a tab', () => {
    expect(draftCustomSpec({ title: 'Report', sheet: 'sales_by_day' }, dayColumns)).toMatchObject({ ok: false, unknown: [] })
    expect(draftCustomSpec({ title: 'Sales/day', sheet: 'sales_by_day', columns: ['day'] }, dayColumns)).toMatchObject({ ok: false })
  })
})

describe('build_custom_report result', () => {
  const draft = draftCustomSpec({ title: 'Best days', sheet: 'sales_by_day', columns: ['day', 'net', 'aov'], sortBy: 'net', descending: true, top: 2 }, dayColumns)
  if (!draft.ok) throw new Error(draft.reason)
  const days = built('sales_by_day', [
    ['2026-11-01', 'Sunday', 40, 12500, 500, 12000, 300, 12000],
    ['2026-11-02', 'Monday', 10, 2500, 0, 2500, 250, 2500],
    ['2026-11-03', 'Tuesday', 30, 18420.555, 0, 18420.555, 614.0185, 18000],
  ])
  const result: ExportResult = { header, sheets: [applyCustomSpec(days, draft.spec)], leftOut: [] }
  const tool = buildCustomReportResult(result, draft.spec, request, '/reports/export?period=custom')

  it('lets the model quote the first rows of a totals sheet, in pesos, under the file’s own headings', () => {
    expect(tool.facts).toMatchObject({
      ready: true,
      title: 'Best days',
      rows: 2,
      columns: ['Day', 'Sales', 'Average order'],
      firstRows: [
        { Day: '2026-11-03', Sales: 18420.56, 'Average order': 614.02 },
        { Day: '2026-11-01', Sales: 12000, 'Average order': 300 },
      ],
    })
  })

  it('puts the file on a card whose links are our export route carrying the same spec', () => {
    const card = tool.card as { type: string; title: string; sheets: unknown[]; notes: string[]; downloads: { label: string; href: string }[] }
    expect(card).toMatchObject({ type: 'file', title: 'Best days', sheets: [{ name: 'Best days', rows: 2 }] })
    expect(card.notes).toEqual(['Made from the Sales by day sheet.', 'Sorted by Sales, highest first.', 'The first 2 of 3 rows.'])
    expect(card.downloads.map((download) => download.label)).toEqual(['Download Excel', 'CSV'])
    for (const download of card.downloads) {
      expect(isExportHref(download.href)).toBe(true)
      const parsed = exportQuerySchema.safeParse(Object.fromEntries(new URLSearchParams(download.href.split('?')[1])))
      expect(parsed.success && parsed.data).toMatchObject({ tenantId: TENANT, sheets: ['sales_by_day'], source: 'owl', custom: draft.spec })
    }
  })

  it('never hands the model rows that hold a person’s details', () => {
    const orderColumns = visibleColumns(EXPORT_SHEETS.orders, everyone)
    const orderDraft = draftCustomSpec({ title: 'GCash orders', sheet: 'orders', columns: ['order_no', 'customer', 'contact', 'total', 'order_id'], filters: [{ column: 'payment_method', op: 'contains', value: 'gcash' }] }, orderColumns)
    if (!orderDraft.ok) throw new Error(orderDraft.reason)
    const row = orderColumns.map((column) => (column.id === 'customer' ? 'Juan Dela Cruz' : column.id === 'contact' ? '09171234567' : column.id === 'payment_method' ? 'GCash' : column.id === 'order_id' ? '33333333-3333-4333-8333-333333333333' : column.kind === 'text' ? 'x' : 1))
    const orderResult: ExportResult = { header, sheets: [applyCustomSpec(built('orders', [row]), orderDraft.spec)], leftOut: [] }
    const facts = factsForModel(buildCustomReportResult(orderResult, orderDraft.spec, request, '/reports/export'))
    const seen = JSON.stringify(facts)
    expect(seen).not.toMatch(/Juan|0917|33333333/)
    expect(facts).toMatchObject({ ready: true, rows: 1, columns: ['Order no.', 'Customer', 'Contact', 'Order total', 'Order ID'] })
    expect(facts).not.toHaveProperty('firstRows')
  })

  it('only totals sheets may be read back: none with a person, a typed note or an id column', () => {
    const personal = /customer|contact|cashier|^who$|_by$|^note$|reason|_id$|paid_to|^tin$|taken|receiver/
    for (const id of SHEET_IDS) {
      if (!SHEETS_OWL_MAY_READ.has(id)) continue
      // The Summary's and the Profit statement's note column is the engine's own wording, not something a person typed.
      const risky = EXPORT_SHEETS[id].columns.map((column) => column.id).filter((column) => personal.test(column) && !((id === 'summary' || id === 'profit') && column === 'note'))
      expect([id, risky]).toEqual([id, []])
    }
  })
})

describe('who gets the tool', () => {
  const flags = { inventoryEnabled: false, customerHubOn: false, menuEngineeringEnabled: false, isPlatformOrders: true }
  const staff = (permissions: string[]) => ({ role: 'admin', tenant_id: TENANT, is_owner: false, permissions, outlet_id: null }) as never
  const names = (caller: never, tenantFlags = flags) => availableTools(ASSISTANT_TOOLS, caller, tenantFlags).map((tool) => tool.name)

  it('needs the Reports key and a store whose orders are on the platform database', () => {
    expect(names(staff(['assistant', 'reports']))).toContain('build_custom_report')
    expect(names(staff(['assistant', 'orders']))).not.toContain('build_custom_report')
    expect(names(staff(['assistant', 'reports']), { ...flags, isPlatformOrders: false })).not.toContain('build_custom_report')
  })

  it('sits right before run_saved_report, after every older tool', () => {
    expect(ASSISTANT_TOOLS[ASSISTANT_TOOLS.length - 3].name).toBe(buildCustomReportTool.name)
  })
})
