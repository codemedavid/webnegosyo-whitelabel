/**
 * A report in the owner's own format: the shape is strict (no figures, no
 * formulas, a tab is fillable), a tab is laid out in the owner's order with
 * blanks where the store has no figure, and a column this account does not
 * get is refused instead of quietly dropped.
 */
import { EXPORT_SHEETS } from '@/lib/exports/catalogue'
import { ExportError } from '@/lib/exports/errors'
import { applyFormatTab, blankHeaders, formatColumnProblems, formatMappingLines, formatSheets, formatSummary, reportFormatSpecSchema, type ReportFormatSpec } from '@/lib/exports/report-format'
import type { BuiltSheet } from '@/lib/exports/types'

const daily = { title: 'Benta', sheet: 'sales_by_day', columns: [{ header: 'Petsa', id: 'day' }, { header: 'Upa', id: null }, { header: 'Benta', id: 'net' }] }

function spec(tabs: unknown[] = [daily]): ReportFormatSpec {
  return reportFormatSpecSchema.parse({ tabs })
}

const built: BuiltSheet = {
  id: 'sales_by_day',
  name: 'Sales by day',
  columns: [
    { id: 'day', header: 'Day', kind: 'text' },
    { id: 'orders', header: 'Orders', kind: 'count' },
    { id: 'net', header: 'Net sales', kind: 'money' },
  ],
  rows: [
    ['2026-11-01', 4, 1200],
    ['2026-11-02', 9, 3100.5],
    ['2026-11-03', 0, null],
    ['2026-11-04', 6, 3100.5],
  ],
  notes: ['Days follow the store’s cut-off.'],
}

describe('reportFormatSpecSchema', () => {
  it('takes the owner’s tabs and columns, and fills in what was left out', () => {
    expect(spec().tabs[0]).toMatchObject({ title: 'Benta', sheet: 'sales_by_day', sort: null, top: null })
  })

  it.each([
    ['no tab', { tabs: [] }],
    ['five tabs', { tabs: [1, 2, 3, 4, 5].map((n) => ({ ...daily, title: `Tab ${n}` })) }],
    ['two tabs with one name, whatever the case', { tabs: [daily, { ...daily, title: 'BENTA' }] }],
    ['a tab nothing can fill', { tabs: [{ ...daily, columns: [{ header: 'Upa', id: null }] }] }],
    ['a sheet that does not exist', { tabs: [{ ...daily, sheet: 'payroll' }] }],
    ['a heading that starts a formula', { tabs: [{ ...daily, columns: [{ header: '=SUM(A1)', id: 'net' }] }] }],
    ['a tab name Excel refuses', { tabs: [{ ...daily, title: 'Sales/Day' }] }],
    ['figures carried in the shape', { tabs: [{ ...daily, rows: [[1, 2]] }] }],
    ['a field it does not know', { tabs: [daily], macro: 'x' }],
    ['a column id that is not one', { tabs: [{ ...daily, columns: [{ header: 'Benta', id: 'Net Sales' }] }] }],
    ['more than 25 columns', { tabs: [{ ...daily, columns: Array.from({ length: 26 }, (_, i) => ({ header: `C${i}`, id: 'net' })) }] }],
  ])('refuses %s', (_, shape) => {
    expect(reportFormatSpecSchema.safeParse(shape).success).toBe(false)
  })
})

describe('applyFormatTab', () => {
  it('lays the tab out in the owner’s order, under their headings, blank where the store has no figure', () => {
    const tab = applyFormatTab(built, spec().tabs[0])
    expect(tab.name).toBe('Benta')
    expect(tab.columns.map((column) => [column.header, column.kind])).toEqual([['Petsa', 'text'], ['Upa', 'text'], ['Benta', 'money']])
    expect(tab.rows).toEqual([
      ['2026-11-01', null, 1200],
      ['2026-11-02', null, 3100.5],
      ['2026-11-03', null, null],
      ['2026-11-04', null, 3100.5],
    ])
    expect(tab.notes).toEqual(['Made from the Sales by day sheet, in your format.', 'Left blank (the store has no figure for it): Upa.', 'Days follow the store’s cut-off.'])
  })

  it('sorts (ties keep the sheet’s order, blanks last) and keeps the first N, saying so', () => {
    const tab = applyFormatTab(built, spec([{ ...daily, sort: { column: 'net', descending: true }, top: 3 }]).tabs[0])
    expect(tab.rows.map((row) => row[0])).toEqual(['2026-11-02', '2026-11-04', '2026-11-01'])
    expect(tab.notes).toContain('Sorted by Net sales, highest first.')
    expect(tab.notes).toContain('The first 3 of 4 rows.')
    const lowest = applyFormatTab(built, spec([{ ...daily, sort: { column: 'net' } }]).tabs[0])
    expect(lowest.rows.map((row) => row[0])).toEqual(['2026-11-01', '2026-11-02', '2026-11-04', '2026-11-03'])
  })

  it('may sort by a column it does not show, and show one column twice', () => {
    const tab = applyFormatTab(built, spec([{ title: 'Busy days', sheet: 'sales_by_day', columns: [{ header: 'Araw', id: 'day' }, { header: 'Araw ulit', id: 'day' }], sort: { column: 'orders', descending: true }, top: 1 }]).tabs[0])
    expect(tab.rows).toEqual([['2026-11-02', '2026-11-02']])
  })

  it('refuses a column the sheet does not have for this account', () => {
    const asked = spec([{ ...daily, columns: [{ header: 'Tubo', id: 'gross_profit' }] }]).tabs[0]
    expect(() => applyFormatTab(built, asked)).toThrow(ExportError)
    expect(() => applyFormatTab(built, asked)).toThrow('The “Benta” tab uses "gross_profit", which Sales by day does not have for this account.')
  })
})

describe('what a format is made of', () => {
  const two = spec([daily, { title: 'Ulam', sheet: 'items', columns: [{ header: 'Ulam', id: 'name' }, { header: 'Benta', id: 'net' }] }, { ...daily, title: 'Benta ulit' }])

  it('reads each sheet once', () => {
    expect(formatSheets(two)).toEqual(['sales_by_day', 'items'])
    expect(blankHeaders(two.tabs[0])).toEqual(['Upa'])
  })

  it('names the columns a sheet lacks, with the ones it has', () => {
    const columnsOf = (sheet: keyof typeof EXPORT_SHEETS) => EXPORT_SHEETS[sheet].columns
    expect(formatColumnProblems(two, columnsOf)).toEqual([])
    const bad = spec([{ ...daily, columns: [{ header: 'Tubo', id: 'profit' }], sort: { column: 'rent' } }])
    const [problem] = formatColumnProblems(bad, columnsOf)
    expect(problem).toMatchObject({ tab: 'Benta', sheet: 'sales_by_day', unknown: ['profit', 'rent'] })
    expect(problem.available.map((column) => column.id)).toContain('net')
  })

  it('says it in one line, and column by column', () => {
    expect(formatSummary(two)).toBe('3 tabs · Benta (Sales by day), Ulam (Items sold), Benta ulit (Sales by day) · 2 columns left blank')
    const lines = formatMappingLines(spec())
    expect(lines[0]).toMatch(/^Benta: one row is /)
    expect(lines.slice(1)).toEqual(['  Petsa → Day', '  Upa → left blank (no figure for this)', `  Benta → ${EXPORT_SHEETS.sales_by_day.columns.find((column) => column.id === 'net')?.header}`])
  })
})
