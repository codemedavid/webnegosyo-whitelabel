import { EXPORT_SHEETS, MAX_DETAIL_DAYS, SHEET_IDS } from '@/lib/exports/catalogue'
import {
  DEFAULT_EXPORT_SHEETS,
  REPORT_EXPORT_SHEETS,
  dayCountInclusive,
  exportCardGroups,
  formatPreviewCell,
  initialSheets,
  parseSheetsParam,
  rangeProblem,
} from '@/lib/exports/export-page-model'
import { REPORT_BREAKDOWNS } from '@/lib/reports/report-view-model'
import type { StaffPermissionKey } from '@/lib/staff-permissions'

const access = (...keys: StaffPermissionKey[]) => ({ has: (key: StaffPermissionKey) => keys.includes(key) })
const everything = { has: () => true }
const ids = (groups: ReturnType<typeof exportCardGroups>) => groups.flatMap((group) => group.cards.map((card) => card.id))

describe('export page cards', () => {
  it('offers every sheet to a full account on a multi-branch store', () => {
    expect([...ids(exportCardGroups(everything, true))].sort()).toEqual([...SHEET_IDS].sort())
  })

  it('does not offer the branches sheet to a single-branch store', () => {
    expect(ids(exportCardGroups(everything, false))).not.toContain('branches')
  })

  it('locks, with a reason, a sheet the account may not have, and drops the columns it may not see', () => {
    const groups = exportCardGroups(access('reports'), true)
    const cards = groups.flatMap((group) => group.cards)
    const customers = cards.find((card) => card.id === 'customers')
    expect(customers?.lockedNote).toMatch(/does not have access/)
    const orders = cards.find((card) => card.id === 'orders')
    expect(orders?.lockedNote).toBeNull()
    const hidden = EXPORT_SHEETS.orders.columns.filter((column) => column.needs === 'customers').map((column) => column.header)
    expect(hidden.length).toBeGreaterThan(0)
    for (const header of hidden) expect(orders?.columns).not.toContain(header)
  })

  it('never starts with a locked sheet ticked', () => {
    const groups = exportCardGroups(access('reports'), false)
    expect(initialSheets(['customers', 'orders'], groups)).toEqual(['orders'])
    expect(initialSheets([], groups)).toEqual([...DEFAULT_EXPORT_SHEETS])
  })
})

describe('report Export buttons', () => {
  it('has a starting set of known sheets for the overview and every breakdown', () => {
    for (const slug of ['overview', ...REPORT_BREAKDOWNS] as const) {
      const sheets = REPORT_EXPORT_SHEETS[slug]
      expect(sheets.length).toBeGreaterThan(0)
      for (const id of sheets) expect(SHEET_IDS).toContain(id)
    }
  })
})

describe('sheets in the link', () => {
  it('keeps known ids once, in catalogue order', () => {
    expect(parseSheetsParam('orders,summary,orders,nope, items ')).toEqual(['summary', 'items', 'orders'])
    expect(parseSheetsParam(['orders', 'summary'])).toEqual(['summary', 'orders'])
    expect(parseSheetsParam(undefined)).toEqual([])
  })
})

describe('range check', () => {
  const cards = exportCardGroups(everything, true).flatMap((group) => group.cards)
  const orders = cards.filter((card) => card.id === 'orders')
  const summary = cards.filter((card) => card.id === 'summary')

  it('counts both ends', () => {
    expect(dayCountInclusive('2026-11-14', '2026-11-14')).toBe(1)
    expect(dayCountInclusive('2026-10-15', '2026-11-14')).toBe(31)
  })

  it('stops a row-by-row sheet past its limit and leaves totals alone', () => {
    expect(rangeProblem(MAX_DETAIL_DAYS, orders)).toBeNull()
    expect(rangeProblem(MAX_DETAIL_DAYS + 1, orders)).toMatch(/up to 93 days/)
    expect(rangeProblem(MAX_DETAIL_DAYS + 1, summary)).toBeNull()
  })
})

describe('preview cells', () => {
  it('prints pesos, counts, shares and blanks as the file means them', () => {
    expect(formatPreviewCell(1499, 'money')).toBe('₱1,499.00')
    expect(formatPreviewCell(37, 'count')).toBe('37')
    expect(formatPreviewCell(0.2686, 'percent')).toBe('26.86%')
    expect(formatPreviewCell({ value: 37, kind: 'count' }, 'money')).toBe('37')
    expect(formatPreviewCell(null, 'money')).toBe('')
    expect(formatPreviewCell({ value: null, kind: 'money' }, 'money')).toBe('')
    expect(formatPreviewCell(0, 'money')).toBe('₱0.00')
    expect(formatPreviewCell('Dine In', 'text')).toBe('Dine In')
  })
})
