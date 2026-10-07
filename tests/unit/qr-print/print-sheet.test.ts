import { describe, it, expect } from '@jest/globals'
import { buildPrintSheetHtml, svgDataUri } from '@/lib/qr-print/print-sheet'

const art = (n: number) => ({ svg: `<svg xmlns="http://www.w3.org/2000/svg"><text>${n}</text></svg>`, width: 800, height: 1100 })

describe('buildPrintSheetHtml', () => {
  it('splits the codes into A4 pages of the chosen size', () => {
    const html = buildPrintSheetHtml({ title: 'Cafe QR codes', artworks: [1, 2, 3, 4, 5].map(art), perPage: 4 })
    expect(html.match(/<section class="page"/g)).toHaveLength(2)
    expect(html.match(/<img /g)).toHaveLength(5)
    expect(html).toContain('size: A4')
  })

  it('lays nine to a page in three columns for stickers', () => {
    const html = buildPrintSheetHtml({ title: 'x', artworks: [art(1)], perPage: 9 })
    expect(html).toContain('grid-template-columns: repeat(3, 1fr)')
  })

  it('escapes the document title', () => {
    expect(buildPrintSheetHtml({ title: '<b>x</b>', artworks: [], perPage: 1 })).toContain('<title>&lt;b&gt;x&lt;/b&gt;</title>')
  })

  it('embeds each artwork as an encoded image, never as live markup', () => {
    const html = buildPrintSheetHtml({ title: 'x', artworks: [art(7)], perPage: 1 })
    expect(html).not.toContain('<svg')
    expect(html).toContain(svgDataUri(art(7).svg))
  })
})

describe('svgDataUri', () => {
  it('percent-encodes the document', () => {
    expect(svgDataUri('<svg a="#"/>')).toBe('data:image/svg+xml;charset=utf-8,%3Csvg%20a%3D%22%23%22%2F%3E')
  })
})
