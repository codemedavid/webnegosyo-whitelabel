/**
 * The extra settings a checkout question keeps in `customer_form_fields.validation_rules`
 * (jsonb): help text, width, and the checks the checkout runs on an answer.
 *
 * The column is owner data and older rows hold `{}` (or anything at all), so
 * every read goes through `readFieldRules`, which keeps only the keys below
 * with values of the right shape. A pattern is never typed by the owner: it is
 * one of `FIELD_PATTERNS`, so the checkout only ever runs regexes written here.
 */

/** Absent = the standard width (long answers and the address span the row, the rest share it). */
export type FieldWidth = 'full' | 'half'

interface FieldPattern {
  label: string
  /** Shown under the box while choosing; also the example in the mistake. */
  example: string
  regex: RegExp
}

/** The only patterns a question can require. Ids are stored in rules — never rename one. */
export const FIELD_PATTERNS = {
  plate: { label: 'Car plate number', example: 'ABC 1234', regex: /^[A-Z]{3}\s?\d{3,4}$/i },
} as const satisfies Readonly<Record<string, FieldPattern>>

export type FieldPatternId = keyof typeof FIELD_PATTERNS

export interface FieldRules {
  /** A line under the box ("We'll text you when it's ready"). */
  help?: string
  /** Full = the whole row; half = two side by side (wider screens). Absent = standard. */
  width?: FieldWidth
  minLength?: number
  maxLength?: number
  /** Only 0-9 (spaces and dashes are allowed between them). */
  digitsOnly?: boolean
  pattern?: FieldPatternId
  /** Number questions: the smallest and largest answer. */
  min?: number
  max?: number
}

export const FIELD_RULE_LIMITS = {
  helpLength: 200,
  /** The longest an answer may be asked to be. */
  maxLength: 2000,
  /** Bounds for number questions' min / max. */
  number: 1_000_000_000,
} as const

const RULE_KEYS = ['help', 'width', 'minLength', 'maxLength', 'digitsOnly', 'pattern', 'min', 'max'] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

function lengthOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= FIELD_RULE_LIMITS.maxLength ? value : undefined
}

function boundOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= FIELD_RULE_LIMITS.number ? value : undefined
}

function isPatternId(value: unknown): value is FieldPatternId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(FIELD_PATTERNS, value)
}

/** The known, well-formed rules in a stored `validation_rules` value (anything else reads as unset). */
export function readFieldRules(raw: unknown): FieldRules {
  if (!isRecord(raw)) return {}
  const help = typeof raw.help === 'string' ? raw.help.trim().slice(0, FIELD_RULE_LIMITS.helpLength) : ''
  const rules: FieldRules = {
    help: help || undefined,
    width: raw.width === 'half' || raw.width === 'full' ? raw.width : undefined,
    minLength: lengthOf(raw.minLength) || undefined,
    maxLength: lengthOf(raw.maxLength) || undefined,
    digitsOnly: raw.digitsOnly === true ? true : undefined,
    pattern: isPatternId(raw.pattern) ? raw.pattern : undefined,
    min: boundOf(raw.min),
    max: boundOf(raw.max),
  }
  return Object.fromEntries(Object.entries(rules).filter(([, value]) => value !== undefined)) as FieldRules
}

/**
 * `raw` with `patch` applied: a key set to undefined / '' / false is removed.
 * Keys this module does not know are kept as they were, so nothing another
 * tool stored is lost.
 */
export function withFieldRules(raw: unknown, patch: Partial<FieldRules>): Record<string, unknown> {
  const base = isRecord(raw) ? raw : {}
  const next: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (!(RULE_KEYS as readonly string[]).includes(key)) continue
    if (value === undefined || value === '' || value === false) delete next[key]
    else next[key] = value
  }
  return next
}

/** The rules' checks on a filled-in answer: the first mistake, or null. */
export function ruleError(label: string, fieldType: string, rules: FieldRules, value: string): string | null {
  if (rules.minLength && value.length < rules.minLength) return `${label} needs at least ${rules.minLength} characters`
  if (rules.maxLength && value.length > rules.maxLength) return `${label} can be at most ${rules.maxLength} characters`
  if (rules.digitsOnly && !/^[\d\s-]+$/.test(value)) return `${label} can only have numbers`
  if (rules.pattern) {
    const pattern = FIELD_PATTERNS[rules.pattern]
    if (!pattern.regex.test(value)) return `${label} should look like ${pattern.example}`
  }
  if (fieldType === 'number') {
    const number = Number(value)
    if (!Number.isFinite(number)) return `${label} should be a number`
    if (rules.min !== undefined && number < rules.min) return `${label} should be at least ${rules.min}`
    if (rules.max !== undefined && number > rules.max) return `${label} should be at most ${rules.max}`
  }
  return null
}
