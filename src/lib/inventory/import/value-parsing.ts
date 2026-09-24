/**
 * Reading a cell the way the merchant meant it.
 *
 * Every parser answers in three ways — blank, a value, or "I can't read this".
 * Blank and unreadable are kept apart on purpose: blank means "leave it as it
 * is", and folding a typo into blank (or into zero) would save a wrong price
 * with no word said.
 */

export type ParsedCell<T> =
  | { kind: 'blank' }
  | { kind: 'value'; value: T }
  | { kind: 'invalid'; raw: string }

const BLANK = { kind: 'blank' } as const

/** Currency marks a merchant types in front of a price. */
const CURRENCY = /₱|php|peso[s]?|\$/gi
const PLAIN_NUMBER = /^-?(\d+\.?\d*|\.\d+)$/

export function parseNumberCell(raw: string): ParsedCell<number> {
  const trimmed = raw.trim()
  if (trimmed === '') return BLANK

  // Thousands commas are the Philippine convention ("1,250.50"); a decimal
  // comma is not, so a comma is always a separator here.
  const cleaned = trimmed.replace(CURRENCY, '').replace(/[,\s]/g, '')
  if (!PLAIN_NUMBER.test(cleaned)) return { kind: 'invalid', raw: trimmed }

  return { kind: 'value', value: Number(cleaned) }
}

const YES = new Set(['yes', 'y', 'true', '1', 'x', '✓', '✔', 'prep', 'active', 'inuse', 'on', 'enabled'])
const NO = new Set([
  'no',
  'n',
  'false',
  '0',
  'raw',
  'inactive',
  'notinuse',
  'retired',
  'archived',
  'off',
  'disabled',
])

export function parseYesNoCell(raw: string): ParsedCell<boolean> {
  const trimmed = raw.trim()
  if (trimmed === '') return BLANK

  const word = trimmed.toLowerCase().replace(/[\s_-]/g, '')
  if (YES.has(word)) return { kind: 'value', value: true }
  if (NO.has(word)) return { kind: 'value', value: false }
  return { kind: 'invalid', raw: trimmed }
}

/** Our CSV export puts `'` before text a spreadsheet would run as a formula. */
const FORMULA_GUARD = /^'(?=[=+\-@])/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * The text a spreadsheet cell displays, from whatever the reader handed back:
 * plain values, rich text runs, formula results, hyperlinks and dates.
 * A cell showing an error (`#DIV/0!`) reads as blank rather than as that text.
 */
export function cellToText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim().replace(FORMULA_GUARD, '')
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10)
  }
  if (!isRecord(value)) return ''

  if (Array.isArray(value.richText)) {
    return value.richText
      .map((run) => (isRecord(run) && typeof run.text === 'string' ? run.text : ''))
      .join('')
      .trim()
  }
  if ('formula' in value || 'sharedFormula' in value) return cellToText(value.result)
  if ('text' in value) return cellToText(value.text)
  return ''
}
