/**
 * Guessing which spreadsheet column is which ingredient field.
 *
 * Two passes. The first takes exact matches only, across every column; the
 * second lets a header that merely CONTAINS a known name ("Total quantity")
 * claim a field nobody took exactly. Running exact first everywhere is what
 * stops an early fuzzy column stealing a field a later column names outright.
 *
 * A field is claimed once. Two "name" columns is a question for the merchant,
 * not something to resolve by silently importing the second.
 */

import { IMPORT_FIELDS, type ImportField, type ImportFieldKey } from '@/lib/inventory/import/fields'

/** Index-aligned with the sheet's headers; `null` = don't import this column. */
export type ColumnMapping = readonly (ImportFieldKey | null)[]

/** Shortest synonym allowed to match inside a longer header ("par" would hit "spare"). */
const MIN_CONTAINS_LENGTH = 4

/** Lowercase letters and digits only, with any bracketed note removed. */
export function normalizeHeader(header: string): string {
  return header
    .replace(/\([^)]*\)|\[[^\]]*\]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function exactField(normalized: string): ImportFieldKey | null {
  if (!normalized) return null
  return IMPORT_FIELDS.find((field) => field.synonyms.includes(normalized))?.key ?? null
}

function containsField(normalized: string, taken: ReadonlySet<ImportFieldKey>): ImportFieldKey | null {
  if (!normalized) return null
  let best: { key: ImportFieldKey; length: number } | null = null

  for (const field of IMPORT_FIELDS) {
    if (taken.has(field.key)) continue
    for (const synonym of field.synonyms) {
      if (synonym.length < MIN_CONTAINS_LENGTH || !normalized.includes(synonym)) continue
      if (!best || synonym.length > best.length) best = { key: field.key, length: synonym.length }
    }
  }
  return best?.key ?? null
}

export function matchColumns(headers: readonly string[]): ColumnMapping {
  const normalized = headers.map(normalizeHeader)
  const taken = new Set<ImportFieldKey>()

  const exact = normalized.map((header) => {
    const key = exactField(header)
    if (!key || taken.has(key)) return null
    taken.add(key)
    return key
  })

  return exact.map((key, index) => {
    if (key) return key
    // A column whose exact match was already claimed stays unmatched: it is a
    // duplicate, and letting it fall through to a fuzzy guess would mislabel it.
    if (exactField(normalized[index])) return null
    const fuzzy = containsField(normalized[index], taken)
    if (fuzzy) taken.add(fuzzy)
    return fuzzy
  })
}

/** Points one column at a field, taking the field off whichever column had it. */
export function assignColumn(
  mapping: ColumnMapping,
  columnIndex: number,
  field: ImportFieldKey | null,
): ColumnMapping {
  return mapping.map((current, index) => {
    if (index === columnIndex) return field
    return field !== null && current === field ? null : current
  })
}

export function missingRequiredFields(mapping: ColumnMapping): ImportField[] {
  return IMPORT_FIELDS.filter((field) => field.isRequired && !mapping.includes(field.key))
}

/** Every column with a title found a field — the file needs no matching step. */
export function isEveryColumnMatched(headers: readonly string[], mapping: ColumnMapping): boolean {
  return headers.every((header, index) => header.trim() === '' || mapping[index] != null)
}
