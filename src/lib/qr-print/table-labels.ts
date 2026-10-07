/**
 * Table labels typed by a merchant who has no floor plan yet ("1-20",
 * "A1-A12", "Patio 1, Patio 2"). The codes are printed, never saved — the
 * storefront only needs the label in `?table=`.
 *
 * Labels are normalized the way checkout and the floor plan compare them, so
 * "Table 3" and "3" are the same table here too.
 */

import { normalizeTableNumber } from '@/lib/order-table-number'

/** A sheet of codes, not a stadium: also caps the PNGs a ZIP export renders. */
export const MAX_TABLE_LABELS = 200
/** Same bound as `dining_tables_label_ck`. */
export const MAX_TABLE_LABEL_LENGTH = 24

export interface ParsedTableLabels {
  labels: string[]
  error: string | null
}

// "A1-A12", "1 - 20", "08-11". Both ends share one optional letter prefix.
const RANGE_PATTERN = /^([A-Za-z]*)\s*(\d+)\s*-\s*([A-Za-z]*)\s*(\d+)$/

function expandRange(match: RegExpMatchArray): string[] | string {
  const [whole, startPrefix, startRaw, endPrefix, endRaw] = match
  if (startPrefix.toUpperCase() !== endPrefix.toUpperCase()) {
    return `"${whole}" mixes two prefixes — write it as ${startPrefix}${startRaw}-${startPrefix}${endRaw}`
  }
  const start = Number(startRaw)
  const end = Number(endRaw)
  const low = Math.min(start, end)
  const high = Math.max(start, end)
  if (high - low + 1 > MAX_TABLE_LABELS) {
    return `That is more than ${MAX_TABLE_LABELS} tables at once`
  }
  // Keep "08" as "08" when both ends were written padded.
  const width = startRaw.length === endRaw.length && startRaw.startsWith('0') ? startRaw.length : 0
  const labels: string[] = []
  for (let n = low; n <= high; n += 1) {
    labels.push(`${startPrefix}${String(n).padStart(width, '0')}`)
  }
  return labels
}

export function parseTableLabels(input: string): ParsedTableLabels {
  const parts = input
    .split(/[,\n;]/)
    .map((part) => part.trim())
    .filter((part) => part !== '')

  const labels: string[] = []
  const seen = new Set<string>()

  for (const part of parts) {
    const match = part.match(RANGE_PATTERN)
    const expanded = match ? expandRange(match) : [part]
    if (typeof expanded === 'string') return { labels: [], error: expanded }

    for (const raw of expanded) {
      const label = normalizeTableNumber(raw)
      if (label === '' || seen.has(label)) continue
      if (label.length > MAX_TABLE_LABEL_LENGTH) {
        return { labels: [], error: `"${raw}" is longer than ${MAX_TABLE_LABEL_LENGTH} characters` }
      }
      seen.add(label)
      labels.push(label)
      if (labels.length > MAX_TABLE_LABELS) {
        return { labels: [], error: `That is more than ${MAX_TABLE_LABELS} tables at once` }
      }
    }
  }

  return { labels, error: null }
}
