import { CSV_BOM, csvCell, money, toCsv } from '@/lib/gov-discount-reports/csv'

describe('csvCell', () => {
  it.each(['=HYPERLINK("http://x")', '+639171234567', '-1+1', '@SUM(A1)', '\tTAB', '\rCR'])(
    'defuses a typed value that a spreadsheet would run: %s',
    (value) => {
      expect(csvCell(value).replace(/^"/, '').startsWith("'")).toBe(true)
    },
  )

  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('Dela Cruz, Juan')).toBe('"Dela Cruz, Juan"')
    expect(csvCell('Juan "Johnny"')).toBe('"Juan ""Johnny"""')
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"')
    expect(csvCell('=A1,B1')).toBe(`"'=A1,B1"`)
  })

  it('writes amounts with two decimals and never guards them', () => {
    expect(csvCell(money(1234.5))).toBe('1234.50')
    expect(csvCell(money(-32))).toBe('-32.00')
    expect(csvCell(money(-0.001))).toBe('0.00')
    expect(csvCell(money(0.1 + 0.2))).toBe('0.30')
  })

  it('writes plain numbers, booleans and blanks', () => {
    expect(csvCell(-3)).toBe('-3')
    expect(csvCell(Number.NaN)).toBe('')
    expect(csvCell(true)).toBe('Yes')
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })

  it('keeps Filipino names intact', () => {
    expect(csvCell('Niño Peñaflor')).toBe('Niño Peñaflor')
  })
})

describe('toCsv', () => {
  it('leads with a BOM and joins rows with CRLF', () => {
    const csv = toCsv(['A', 'B'], [[1, 'x'], [money(2), null]])
    expect(csv.startsWith(CSV_BOM)).toBe(true)
    expect(csv.slice(1)).toBe('A,B\r\n1,x\r\n2.00,\r\n')
  })
})
