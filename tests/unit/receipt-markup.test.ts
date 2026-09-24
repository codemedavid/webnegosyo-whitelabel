import {
  parseReceiptMarkup,
  parseReceiptMarkupLine,
  receiptSegmentsToHtml,
} from '@/lib/receipt-markup'

/**
 * The Studio preview and the browser print draw styled receipt lines the way
 * the thermal head does — bold, double height, double size, aligned — instead
 * of flattening them to plain monospace, so what the merchant sees while
 * designing is what the paper shows.
 */

describe('parseReceiptMarkupLine', () => {
  it('reads a plain line as one left-aligned run', () => {
    expect(parseReceiptMarkupLine('Latte   P240.00')).toEqual({
      align: 'left',
      isTall: false,
      runs: [{ text: 'Latte   P240.00', bold: false, tall: false, wide: false }],
    })
  })

  it('reads alignment and nested font tags', () => {
    expect(parseReceiptMarkupLine('<C><W><B>KAPE CO</B></W></C>')).toEqual({
      align: 'center',
      isTall: true,
      runs: [{ text: 'KAPE CO', bold: true, tall: false, wide: true }],
    })
  })

  it('splits a line into runs where the style changes', () => {
    const line = parseReceiptMarkupLine('<R>Total <B>P9.00</B></R>')
    expect(line.align).toBe('right')
    expect(line.runs).toEqual([
      { text: 'Total ', bold: false, tall: false, wide: false },
      { text: 'P9.00', bold: true, tall: false, wide: false },
    ])
  })

  it('keeps a style on while any nested copy of its tag is open', () => {
    const line = parseReceiptMarkupLine('<B><B>a</B>b</B>c')
    expect(line.runs.map((run) => [run.text, run.bold])).toEqual([
      ['a', true],
      ['b', true],
      ['c', false],
    ])
  })

  it('reads a blank line as no runs', () => {
    expect(parseReceiptMarkupLine('')).toEqual({ align: 'left', isTall: false, runs: [] })
  })
})

describe('parseReceiptMarkup', () => {
  it('parses every line of a segment', () => {
    expect(parseReceiptMarkup('a\n\n<H>b</H>')).toHaveLength(3)
  })
})

describe('receiptSegmentsToHtml', () => {
  it('escapes merchant text and marks up the styles', () => {
    const html = receiptSegmentsToHtml([{ type: 'text', text: '<C><B>Tom & Jerry <3</B></C>' }])
    expect(html).toContain('Tom &amp; Jerry &lt;3')
    expect(html).toContain('text-align:center')
    expect(html).toContain('font-weight:700')
  })

  it('prints a QR as its link and skips images', () => {
    const html = receiptSegmentsToHtml([
      { type: 'image', url: 'https://cdn/logo.png' },
      { type: 'qr', data: 'https://kape.co/t/A' },
    ])
    expect(html).toContain('https://kape.co/t/A')
    expect(html).not.toContain('logo.png')
  })
})
