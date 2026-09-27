/**
 * RFC 4180 CSV, both directions.
 *
 * Hand-written rather than a dependency because the whole of it is this file:
 * quoted cells, doubled quotes, line breaks inside quotes, and a separator
 * sniffed from the header row — Excel on a European-locale laptop saves CSV
 * with semicolons, and Google Sheets' "tab-separated" export uses tabs.
 */

export type CsvCell = string | number | boolean | null | undefined

const SEPARATORS = [',', ';', '\t'] as const

/** The separator that splits the first line (outside quotes) the most. */
function sniffSeparator(text: string): string {
  const counts = new Map<string, number>(SEPARATORS.map((sep) => [sep, 0]))
  let inQuotes = false

  for (const char of text) {
    if (char === '"') inQuotes = !inQuotes
    else if (!inQuotes && (char === '\n' || char === '\r')) break
    else if (!inQuotes && counts.has(char)) counts.set(char, (counts.get(char) ?? 0) + 1)
  }

  let best: string = ','
  for (const [sep, count] of counts) if (count > (counts.get(best) ?? 0)) best = sep
  return best
}

export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '')
  if (text === '') return []

  const separator = sniffSeparator(text)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (inQuotes) {
      if (char !== '"') cell += char
      else if (text[i + 1] === '"') {
        cell += '"'
        i++
      } else inQuotes = false
      continue
    }

    if (char === '"') inQuotes = true
    else if (char === separator) {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += char
  }

  // A file that ends without a final line break still has a last row.
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

/**
 * Text a spreadsheet would execute (`=`, `+`, `-`, `@`) gets a leading `'`.
 * An ingredient named `=HYPERLINK(...)` is otherwise a live formula the moment
 * someone opens the export. `cellToText` removes the mark on the way back in.
 */
function guardFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
}

function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  const text = guardFormula(value)
  return /[",\n\r;\t]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(rows: readonly (readonly CsvCell[])[]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
}
