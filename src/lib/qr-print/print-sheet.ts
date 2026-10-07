/**
 * The document the browser prints: A4 pages of QR artwork, 1, 4 or 9 to a
 * page. It is printed from a hidden iframe, so the admin chrome never reaches
 * the paper and "Save as PDF" in the print dialog gives a clean file.
 *
 * Every artwork goes in as an <img> of an encoded SVG — the sheet carries no
 * merchant markup of its own.
 */

import type { QrArtwork } from '@/lib/qr-print/qr-artwork'

export type CodesPerPage = 1 | 4 | 9

export const CODES_PER_PAGE_OPTIONS: readonly { value: CodesPerPage; label: string; hint: string }[] = [
  { value: 1, label: '1 per page', hint: 'Posters and counter signs' },
  { value: 4, label: '4 per page', hint: 'Table tents, about 9 × 13 cm' },
  { value: 9, label: '9 per page', hint: 'Stickers, about 6 × 8 cm' },
]

const COLUMNS: Record<CodesPerPage, number> = { 1: 1, 4: 2, 9: 3 }
const PAGE_MARGIN_MM = 10
const GAP_MM = 6

export interface PrintSheetInput {
  title: string
  artworks: QrArtwork[]
  perPage: CodesPerPage
}

export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size))
}

export function buildPrintSheetHtml({ title, artworks, perPage }: PrintSheetInput): string {
  const columns = COLUMNS[perPage]
  const rows = Math.ceil(perPage / columns)
  const pages = chunk(artworks, perPage)
    .map(
      (page) =>
        `<section class="page">${page
          .map((artwork) => `<div class="cell"><img src="${svgDataUri(artwork.svg)}" alt="" /></div>`)
          .join('')}</section>`
    )
    .join('')

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: ${PAGE_MARGIN_MM}mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .page {
    display: grid;
    grid-template-columns: repeat(${columns}, 1fr);
    grid-template-rows: repeat(${rows}, 1fr);
    gap: ${GAP_MM}mm;
    width: ${210 - PAGE_MARGIN_MM * 2}mm;
    height: ${297 - PAGE_MARGIN_MM * 2}mm;
    break-after: page;
    page-break-after: always;
  }
  .page:last-child { break-after: auto; page-break-after: auto; }
  .cell { display: flex; align-items: center; justify-content: center; min-width: 0; min-height: 0; }
  .cell img { max-width: 100%; max-height: 100%; object-fit: contain; }
</style>
</head>
<body>${pages}</body>
</html>`
}
