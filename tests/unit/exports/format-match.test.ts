/**
 * The first guess of what the owner's headings mean: the same words, or the
 * trade's words for them in English and Filipino; nothing matched stays
 * blank, and a heading can never start a formula once cleaned.
 */
import { EXPORT_SHEETS, SHEET_IDS, type SheetId } from '@/lib/exports/catalogue'
import { cleanHeading, cleanTabTitle, guessColumn, guessTab, rowIsShort } from '@/lib/exports/format-match'
import { reportFormatSpecSchema } from '@/lib/exports/report-format'

const columnsOf = (sheet: SheetId) => EXPORT_SHEETS[sheet].columns

describe('cleaning the owner’s own words', () => {
  it('makes a heading one plain line that cannot start a formula', () => {
    expect(cleanHeading('  Net\nSales ', 0)).toBe('Net Sales')
    expect(cleanHeading('=HYPERLINK("http://x")', 0)).toBe('HYPERLINK("http://x")')
    expect(cleanHeading('+63 912', 0)).toBe('63 912')
    expect(cleanHeading('@total', 0)).toBe('total')
    expect(cleanHeading('', 2)).toBe('Column 3')
    expect(cleanHeading('---', 0)).toBe('Column 1')
    expect(cleanHeading('x'.repeat(90), 0)).toHaveLength(60)
  })

  it('makes a tab name Excel accepts', () => {
    expect(cleanTabTitle('Sales/Day [Nov]: 2026?', 0)).toBe('Sales Day Nov 2026')
    expect(cleanTabTitle('', 1)).toBe('Sheet 2')
    expect(cleanTabTitle('t'.repeat(50), 0)).toHaveLength(31)
  })

  it('whatever the file says, the cleaned words pass the format’s own schema', () => {
    const nasty = ['=cmd|" /C calc"!A0', '-1+1', '@SUM(1)', '\tTab\u0000bed', '', '   ', 'Ⓐ fancy', '日付']
    const columns = nasty.map((raw, index) => ({ header: cleanHeading(raw, index), id: index === 0 ? 'day' : null }))
    const parsed = reportFormatSpecSchema.safeParse({ tabs: [{ title: cleanTabTitle('=1+1', 0), sheet: 'sales_by_day', columns }] })
    expect(parsed.success).toBe(true)
  })
})

describe('guessColumn', () => {
  it('matches the same heading or id first', () => {
    expect(guessColumn('Average order', columnsOf('sales_by_day'))?.id).toBe('aov')
    expect(guessColumn('AOV', columnsOf('sales_by_day'))?.id).toBe('aov')
    expect(guessColumn('money received', columnsOf('sales_by_day'))?.id).toBe('collected')
  })

  it('knows the trade’s words, in English and Filipino', () => {
    expect(guessColumn('Petsa', columnsOf('sales_by_day'))?.id).toBe('day')
    expect(guessColumn('BENTA', columnsOf('sales_by_day'))?.id).toBe('net')
    expect(guessColumn('No. of Orders', columnsOf('sales_by_day'))?.id).toBe('orders')
    expect(guessColumn('Ulam', columnsOf('items'))?.id).toBe('name')
    expect(guessColumn('Dami', columnsOf('items'))?.id).toBe('quantity')
    expect(guessColumn('Sangkap', columnsOf('stock_usage'))?.id).toBe('ingredient')
    expect(guessColumn('Nagamit', columnsOf('stock_usage'))?.id).toBe('used')
  })

  it('means what the SHEET has: "total" is the bill on Orders and sales on a day', () => {
    expect(guessColumn('Total', columnsOf('orders'))?.id).toBe('total')
    expect(guessColumn('Total', columnsOf('sales_by_day'))?.id).toBe('net')
    expect(guessColumn('Date', columnsOf('sales_by_day'))?.id).toBe('day')
    // The sheet's own heading wins over the trade's word.
    expect(guessColumn('Date', columnsOf('orders'))?.id).toBe('date')
    expect(guessColumn('Petsa', columnsOf('orders'))?.id).toBe('business_day')
  })

  it('leaves blank what the store keeps no figure for', () => {
    for (const heading of ['Upa', 'Kuryente', 'Sweldo', 'Remarks ni Ate', '']) expect(guessColumn(heading, columnsOf('sales_by_day'))).toBeNull()
  })
})

describe('guessTab', () => {
  const all = (sheet: SheetId) => columnsOf(sheet)

  it('ranks the sheet most headings match first, and never gives one figure to two headings', () => {
    const [best] = guessTab(['Petsa', 'Benta', 'Sales', 'Orders', 'Upa'], SHEET_IDS, all)
    expect(best).toEqual({ sheet: 'sales_by_day', columns: ['day', 'net', null, 'orders', null], matched: 3 })
    expect(guessTab(['Ulam', 'Dami', 'Benta'], SHEET_IDS, all)[0]).toMatchObject({ sheet: 'items', matched: 3 })
    expect(guessTab(['Sangkap', 'Simula', 'Nagamit', 'Natira'], SHEET_IDS, all)[0]).toMatchObject({ sheet: 'stock_usage', columns: ['ingredient', 'opening', 'used', 'closing'] })
  })

  it('never offers a sheet or a column this account may not have', () => {
    const noStock = (sheet: SheetId) => (sheet.startsWith('stock') ? null : columnsOf(sheet))
    expect(guessTab(['Sangkap', 'Nagamit'], SHEET_IDS, noStock).some((guess) => guess.sheet.startsWith('stock'))).toBe(false)
    const noCosts = (sheet: SheetId) => columnsOf(sheet).filter((column) => column.needs !== 'costs')
    expect(guessTab(['Ingredient', 'Stock value'], ['stock_on_hand'], noCosts)[0].columns).toEqual(['ingredient', null])
  })

  it('says what one row of a sheet is, briefly', () => {
    expect(rowIsShort('sales_by_day')).toBe('a business day')
    expect(rowIsShort('items')).toBe('a dish')
  })
})
