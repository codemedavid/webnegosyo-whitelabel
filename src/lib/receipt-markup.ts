import type { ReceiptSegment, ReceiptTextAlign } from '@/lib/receipt-layout'

/**
 * Receipt markup → styled lines, for surfaces that can draw type rather than
 * send printer bytes: the Receipt Studio preview and the browser print. The
 * tags are the engine's own — `<C>`/`<R>` align the line, `<B>` bolds,
 * `<H>` doubles the height and `<W>` doubles width and height — and like the
 * ESC/POS translator in the app, nested copies of a tag are counted, so a
 * style stays on until the last one closes.
 */

export interface ReceiptRun {
  text: string
  bold: boolean
  tall: boolean
  wide: boolean
}

export interface ReceiptPreviewLine {
  align: ReceiptTextAlign
  /** The line holds double-height type, so it takes two rows of paper. */
  isTall: boolean
  runs: ReceiptRun[]
}

const TAG_PATTERN = /<(\/?)([CRBHW])>/g

export function parseReceiptMarkupLine(line: string): ReceiptPreviewLine {
  const runs: ReceiptRun[] = []
  const depth = { B: 0, H: 0, W: 0 }
  let align: ReceiptTextAlign = 'left'
  let last = 0

  const pushText = (text: string) => {
    if (text === '') return
    runs.push({ text, bold: depth.B > 0, tall: depth.H > 0, wide: depth.W > 0 })
  }

  for (const match of line.matchAll(TAG_PATTERN)) {
    pushText(line.slice(last, match.index))
    last = match.index + match[0].length
    const isClose = match[1] === '/'
    const tag = match[2] as 'C' | 'R' | 'B' | 'H' | 'W'
    if (tag === 'C' || tag === 'R') {
      if (!isClose && align === 'left') align = tag === 'C' ? 'center' : 'right'
      continue
    }
    depth[tag] = Math.max(0, depth[tag] + (isClose ? -1 : 1))
  }
  pushText(line.slice(last))

  return { align, isTall: runs.some((run) => run.tall || run.wide), runs }
}

export function parseReceiptMarkup(text: string): ReceiptPreviewLine[] {
  return text.split('\n').map(parseReceiptMarkupLine)
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function runToHtml(run: ReceiptRun): string {
  const styles = [
    run.bold ? 'font-weight:700' : '',
    run.wide ? 'font-size:2em' : '',
    run.tall && !run.wide ? 'display:inline-block;transform:scaleY(2)' : '',
  ].filter(Boolean)
  const text = escapeHtml(run.text)
  return styles.length > 0 ? `<span style="${styles.join(';')}">${text}</span>` : text
}

function lineToHtml(line: ReceiptPreviewLine): string {
  const height = line.isTall ? 'line-height:2.7em;' : ''
  return `<div style="text-align:${line.align};${height}">${line.runs.map(runToHtml).join('') || '&nbsp;'}</div>`
}

/**
 * The receipt as styled HTML lines for the browser print window. A QR prints
 * as its link (a browser has no raster path to the head); a logo is skipped,
 * as the flat renderer always has.
 */
export function receiptSegmentsToHtml(segments: ReceiptSegment[]): string {
  return segments
    .map((segment) => {
      if (segment.type === 'image') return ''
      if (segment.type === 'qr') {
        return `<div style="word-break:break-all">${escapeHtml(segment.data)}</div>`
      }
      return parseReceiptMarkup(segment.text).map(lineToHtml).join('')
    })
    .join('')
}
