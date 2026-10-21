/**
 * The amount keypad behind "amount first" entry (plan §5.1), plus the peso
 * formatting and parsing every expense screen shares.
 *
 * Whole pesos by default: digits, `00` and backspace. A long-press on `00`
 * (`decimal`) switches to centavos, which take at most two digits. Nothing
 * past ₱10,000,000 can be typed: a key that would pass it is ignored and the
 * SAME state object comes back, so a screen can tell "nothing happened" (and
 * skip the haptic) by identity.
 *
 * Money is integer centavos and is built from the typed digits as strings,
 * never through float pesos. Copied byte-for-byte into the merchant app
 * (`tests/unit/expenses/app-parity.test.ts`).
 */

/** ₱10,000,000 — the database cap on `expenses.amount_cents`. */
export const MAX_AMOUNT_CENTS = 1_000_000_000

const CENTAVO_DIGITS = 2

export type KeypadDigit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
export type KeypadKey = KeypadDigit | '00' | 'decimal' | 'backspace' | 'clear'

export interface KeypadState {
  /** Whole-peso digits, no leading zeros ('' = nothing typed). */
  readonly whole: string
  /** Centavo digits typed so far; null = not in centavos mode. */
  readonly fraction: string | null
}

export const EMPTY_KEYPAD: KeypadState = Object.freeze({ whole: '', fraction: null })

function centsOf(whole: string, fraction: string | null): number {
  const pesos = whole === '' ? 0 : Number(whole)
  const centavos = fraction ? Number(fraction.padEnd(CENTAVO_DIGITS, '0')) : 0
  return pesos * 100 + centavos
}

export function keypadCents(state: KeypadState): number {
  return centsOf(state.whole, state.fraction)
}

function withinCap(whole: string, fraction: string | null): boolean {
  return centsOf(whole, fraction) <= MAX_AMOUNT_CENTS
}

function appendWhole(state: KeypadState, digits: string): KeypadState {
  const whole = `${state.whole}${digits}`.replace(/^0+/, '')
  if (whole === state.whole) return state
  return withinCap(whole, null) ? { whole, fraction: null } : state
}

function appendFraction(state: KeypadState, fractionSoFar: string, digits: string): KeypadState {
  const room = CENTAVO_DIGITS - fractionSoFar.length
  const fraction = `${fractionSoFar}${digits.slice(0, room)}`
  if (fraction === fractionSoFar) return state
  return withinCap(state.whole, fraction) ? { whole: state.whole, fraction } : state
}

function backspace(state: KeypadState): KeypadState {
  if (state.fraction === null) {
    return state.whole === '' ? state : { whole: state.whole.slice(0, -1), fraction: null }
  }
  return {
    whole: state.whole,
    fraction: state.fraction === '' ? null : state.fraction.slice(0, -1),
  }
}

/** The next state after one key. Returns the same object when the key changes nothing. */
export function pressKey(state: KeypadState, key: KeypadKey): KeypadState {
  if (key === 'clear') return EMPTY_KEYPAD
  if (key === 'backspace') return backspace(state)
  if (key === 'decimal') return state.fraction === null ? { whole: state.whole, fraction: '' } : state
  return state.fraction === null ? appendWhole(state, key) : appendFraction(state, state.fraction, key)
}

export function pressKeys(state: KeypadState, keys: readonly KeypadKey[]): KeypadState {
  return keys.reduce(pressKey, state)
}

/** A keypad already holding `cents` (a repeat chip fills it). Anything it couldn't hold → empty. */
export function keypadFromCents(cents: number): KeypadState {
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_AMOUNT_CENTS) return EMPTY_KEYPAD
  const whole = Math.floor(cents / 100)
  const centavos = cents % 100
  return {
    whole: whole === 0 ? '' : String(whole),
    fraction: centavos === 0 ? null : String(centavos).padStart(CENTAVO_DIGITS, '0'),
  }
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** What the amount line shows while typing: "₱1,250", "₱12.", "₱12.5". */
export function keypadDisplay(state: KeypadState): string {
  const whole = groupThousands(state.whole === '' ? '0' : state.whole)
  return state.fraction === null ? `₱${whole}` : `₱${whole}.${state.fraction}`
}

export interface FormatPesoOptions {
  /** 'auto' (lists): decimals only when they aren't zero. 'always' (detail, export). */
  decimals?: 'auto' | 'always'
}

/** "₱1,250", "₱1,250.50", "−₱3,200" (a real minus sign, same width as a digit). */
export function formatPeso(cents: number, options: FormatPesoOptions = {}): string {
  const rounded = Number.isFinite(cents) ? Math.round(cents) : 0
  const absolute = Math.abs(rounded)
  const centavos = absolute % 100
  const whole = groupThousands(String((absolute - centavos) / 100))
  const showDecimals = options.decimals === 'always' || centavos !== 0
  const body = showDecimals ? `${whole}.${String(centavos).padStart(CENTAVO_DIGITS, '0')}` : whole
  return rounded < 0 ? `−₱${body}` : `₱${body}`
}

const PESO_PREFIX = /^(?:₱|php|p)\s*/i
const GROUPED_WHOLE = /^\d{1,3}(?:,\d{3})+$/
const PLAIN_WHOLE = /^\d*$/
const FRACTION = /^\d{0,2}$/

/**
 * A peso amount typed into a web text field → centavos, or null when it isn't
 * one. Takes "1,250.50", "₱80", "PHP 1,000", ".75", "12."; refuses negatives,
 * three decimals, misplaced commas, exponents and anything over the cap.
 */
export function parsePesoInput(text: string): number | null {
  const trimmed = text.trim().replace(PESO_PREFIX, '')
  const parts = trimmed.split('.')
  if (parts.length > 2) return null
  const [whole, fraction = ''] = parts
  if (whole === '' && fraction === '') return null
  if (!(PLAIN_WHOLE.test(whole) || GROUPED_WHOLE.test(whole)) || !FRACTION.test(fraction)) return null
  const cents = centsOf(whole.replace(/,/g, ''), fraction)
  return cents <= MAX_AMOUNT_CENTS ? cents : null
}
