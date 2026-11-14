/**
 * Saved report formats ("My formats"): a stored row is read again before it
 * is trusted, a format is described and locked per account, and a name the
 * owner says finds the format they meant.
 */
import { customReportSpecSchema, type CustomReportSpec } from '@/lib/exports/custom-report'
import {
  findTemplate,
  templateActionSchema,
  templateCard,
  templateRangeProblem,
  templateSpecProblem,
  templateSummary,
  toReportTemplate,
  type ReportTemplate,
} from '@/lib/exports/report-templates'
import type { StaffPermissionKey } from '@/lib/staff-permissions'

const TENANT = 'aaaaaaaa-0000-4000-8000-000000000001'
const ID = 'bbbbbbbb-0000-4000-8000-000000000001'

function spec(overrides: Record<string, unknown> = {}): CustomReportSpec {
  return customReportSpecSchema.parse({
    title: 'Average order per day',
    sheet: 'sales_by_day',
    columns: [{ id: 'day' }, { id: 'aov', header: 'Avg ticket' }, { id: 'orders' }],
    filters: [{ column: 'orders', op: 'at_least', value: 1 }],
    sort: { column: 'aov', descending: true },
    top: 5,
    ...overrides,
  })
}

const row = (overrides: Record<string, unknown> = {}) => ({ id: ID, name: 'Weekly owner report', kind: 'custom', spec: spec(), created_by_label: ' Ana ', created_at: '2026-11-14T02:00:00Z', ...overrides })
const access = (...keys: StaffPermissionKey[]) => ({ has: (key: StaffPermissionKey) => keys.includes(key) })

describe('toReportTemplate', () => {
  it('reads a stored row as a format', () => {
    expect(toReportTemplate(row())).toEqual({ id: ID, name: 'Weekly owner report', spec: spec(), savedBy: 'Ana', savedAt: '2026-11-14T02:00:00Z' })
    expect(toReportTemplate(row({ created_by_label: null }))?.savedBy).toBeNull()
  })

  it('leaves out a row this build cannot read: another kind, a sheet it does not know, a spec with extra fields, a name that starts a formula', () => {
    expect(toReportTemplate(row({ kind: 'format' }))).toBeNull()
    expect(toReportTemplate(row({ spec: { ...spec(), sheet: 'payroll' } }))).toBeNull()
    expect(toReportTemplate(row({ spec: { ...spec(), figures: [[1, 2]] } }))).toBeNull()
    expect(toReportTemplate(row({ name: '=HYPERLINK("x")' }))).toBeNull()
    expect(toReportTemplate(null)).toBeNull()
  })
})

describe('what a client may ask the formats route for', () => {
  it('takes save and remove, strictly', () => {
    expect(templateActionSchema.safeParse({ action: 'save', tenantId: TENANT, name: ' Weekly ', spec: spec() })).toMatchObject({ success: true, data: { name: 'Weekly' } })
    expect(templateActionSchema.safeParse({ action: 'remove', tenantId: TENANT, id: ID }).success).toBe(true)
    expect(templateActionSchema.safeParse({ action: 'remove', tenantId: TENANT, id: ID, all: true }).success).toBe(false)
    expect(templateActionSchema.safeParse({ action: 'rename', tenantId: TENANT, id: ID, name: 'x' }).success).toBe(false)
    expect(templateActionSchema.safeParse({ action: 'save', tenantId: TENANT, name: 'x'.repeat(61), spec: spec() }).success).toBe(false)
    expect(templateActionSchema.safeParse({ action: 'save', tenantId: TENANT, name: '+SUM(A1)', spec: spec() }).success).toBe(false)
    expect(templateActionSchema.safeParse({ action: 'save', tenantId: TENANT, name: 'Weekly', spec: { ...spec(), rows: [[1]] } }).success).toBe(false)
  })
})

describe('templateSpecProblem', () => {
  it('passes a spec whose columns the sheet has, even ones only some accounts see', () => {
    expect(templateSpecProblem(spec())).toBeNull()
    expect(templateSpecProblem(spec({ sheet: 'stock_usage', columns: [{ id: 'ingredient' }, { id: 'used_cost' }], filters: [], sort: null }))).toBeNull()
  })

  it('refuses a column the sheet does not have for anyone', () => {
    expect(templateSpecProblem(spec({ columns: [{ id: 'day' }, { id: 'profit' }] }))).toBe('Sales by day has no column called "profit".')
  })
})

describe('templateSummary', () => {
  it('says what the format is made of, under its own headings', () => {
    expect(templateSummary(spec())).toBe('Sales by day · Day, Avg ticket, Orders · 1 filter · highest Avg ticket first · first 5')
    expect(templateSummary(spec({ filters: [], sort: null, top: null }))).toBe('Sales by day · Day, Avg ticket, Orders')
  })
})

describe('templateCard', () => {
  const template = (overrides: Record<string, unknown> = {}): ReportTemplate => ({ id: ID, name: 'Weekly owner report', spec: spec(overrides), savedBy: 'Ana', savedAt: '2026-11-14T02:00:00Z' })

  it('is open to an account that may have the sheet and every column', () => {
    expect(templateCard(template(), access('reports'), false)).toMatchObject({ name: 'Weekly owner report', isDetail: false, lockedNote: null, savedBy: 'Ana' })
  })

  it('is locked for an account without the sheet’s keys', () => {
    const stock = template({ sheet: 'stock_usage', columns: [{ id: 'ingredient' }, { id: 'used' }], filters: [], sort: null })
    expect(templateCard(stock, access('reports'), false).lockedNote).toBe('Not on your account: your account does not have access to it.')
    expect(templateCard(stock, access('reports', 'inventory'), false).lockedNote).toBeNull()
  })

  it('is locked when it uses a column the account does not see (saved by someone with the costs key)', () => {
    const costed = template({ sheet: 'stock_usage', columns: [{ id: 'ingredient' }, { id: 'used_cost' }], filters: [], sort: null })
    expect(templateCard(costed, access('reports', 'inventory'), false).lockedNote).toBe('Not on your account: it uses a column your account does not have access to.')
    expect(templateCard(costed, access('reports', 'inventory', 'costs'), false).lockedNote).toBeNull()
  })

  it('marks row-by-row formats, which take a shorter range', () => {
    const orders = templateCard(template({ sheet: 'orders', columns: [{ id: 'order_no' }, { id: 'total' }], filters: [], sort: null }), access('reports', 'orders'), false)
    expect(orders.isDetail).toBe(true)
    expect(templateRangeProblem(120, orders)).toBe('Weekly owner report lists every row, so one file covers up to 93 days. You picked 120.')
    expect(templateRangeProblem(93, orders)).toBeNull()
    expect(templateRangeProblem(400, { name: 'Totals', isDetail: false })).toBeNull()
  })
})

describe('findTemplate', () => {
  const saved = [{ name: 'Weekly owner report' }, { name: 'Top dishes' }, { name: 'Top customers' }, { name: 'Café ulat' }]

  it('finds the exact name however it was cased, accented or wrapped', () => {
    expect(findTemplate('weekly OWNER report', saved)?.name).toBe('Weekly owner report')
    expect(findTemplate('my Weekly owner report', saved)?.name).toBe('Weekly owner report')
    expect(findTemplate('the top dishes report', saved)?.name).toBe('Top dishes')
    expect(findTemplate('cafe ulat', saved)?.name).toBe('Café ulat')
  })

  it('takes part of a name only when one format has it', () => {
    expect(findTemplate('weekly', saved)?.name).toBe('Weekly owner report')
    expect(findTemplate('top', saved)).toBeNull()
    expect(findTemplate('payroll', saved)).toBeNull()
    expect(findTemplate('my report', saved)).toBeNull()
  })
})
