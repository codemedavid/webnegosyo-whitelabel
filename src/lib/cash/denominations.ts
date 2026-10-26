/**
 * Philippine bills and coins, and the drawer count built from them
 * (cashier plan, CONTRACTS §2 and §5).
 *
 * A count is stored as one JSON object on `staff_shifts.opening_denominations`
 * / `closing_denominations`: `{ "<key>": <pieces> }` with the keys below, plus
 * an optional `loose_coins_cents` for coins a cashier weighed or rolled and
 * counted by total. SQL `cash.denominations_total_cents(jsonb)` totals the
 * same object, so the rules here are the rules there:
 *
 * - keys exactly `b1000 b500 b200 b100 b50 b20 c20 c10 c5 c1 c025 c005 c001`
 *   (b = bill, c = coin, value in pesos, `025` = 25 centavos). The ₱20 bill and
 *   the ₱20 coin are separate rows because they sit in different trays;
 * - every count is a whole number from 0 to 100000 pieces per denomination;
 * - `loose_coins_cents` is whole centavos from 0 to ₱100,000;
 * - anything else (an unknown key, a fraction, a string, an array) makes the
 *   whole count invalid. An invalid count is refused, never half-totalled.
 *
 * Money is integer centavos throughout. Copied byte-for-byte into the merchant
 * app (`tests/unit/cash/cash-twins-parity.test.ts`); imports nothing.
 */

export type DenominationKey =
  | 'b1000'
  | 'b500'
  | 'b200'
  | 'b100'
  | 'b50'
  | 'b20'
  | 'c20'
  | 'c10'
  | 'c5'
  | 'c1'
  | 'c025'
  | 'c005'
  | 'c001'

export type DenominationKind = 'bill' | 'coin'

export interface Denomination {
  readonly key: DenominationKey
  /** Face value in centavos. */
  readonly cents: number
  readonly kind: DenominationKind
  /** "₱1000", "₱20", "25¢". */
  readonly label: string
  /** "₱100 bills", "25¢ coins" — what a screen reader says for the row. */
  readonly pluralLabel: string
  /** 5¢ and 1¢: hidden behind "More coins" until the cashier asks for them. */
  readonly isMoreCoins: boolean
}

/** Pieces of one denomination a count may hold (the SQL twin's cap). */
export const MAX_PIECES = 100000

/** The extra key for coins counted by total, in centavos. */
export const LOOSE_COINS_KEY = 'loose_coins_cents'

/** ₱100,000 of loose coins: far above any drawer, low enough to catch a typo. */
export const MAX_LOOSE_COINS_CENTS = 10000000

/** A drawer count. Rows that are absent hold zero pieces. */
export type DenominationCounts = Readonly<Partial<Record<DenominationKey, number>>> & {
  readonly loose_coins_cents?: number
}

export const EMPTY_COUNTS: DenominationCounts = Object.freeze({})

function denomination(key: DenominationKey, cents: number, isMoreCoins = false): Denomination {
  const kind: DenominationKind = key.startsWith('b') ? 'bill' : 'coin'
  const label = cents >= 100 ? `₱${cents / 100}` : `${cents}¢`
  return Object.freeze({
    key,
    cents,
    kind,
    label,
    pluralLabel: `${label} ${kind === 'bill' ? 'bills' : 'coins'}`,
    isMoreCoins,
  })
}

/** Bills first, then coins, biggest first — the way a cashier fans them out. */
export const PH_DENOMINATIONS: readonly Denomination[] = Object.freeze([
  denomination('b1000', 100000),
  denomination('b500', 50000),
  denomination('b200', 20000),
  denomination('b100', 10000),
  denomination('b50', 5000),
  denomination('b20', 2000),
  denomination('c20', 2000),
  denomination('c10', 1000),
  denomination('c5', 500),
  denomination('c1', 100),
  denomination('c025', 25),
  denomination('c005', 5, true),
  denomination('c001', 1, true),
])

export const DENOMINATION_KEYS: readonly DenominationKey[] = Object.freeze(PH_DENOMINATIONS.map((d) => d.key))

const BY_KEY: ReadonlyMap<string, Denomination> = new Map(PH_DENOMINATIONS.map((d) => [d.key, d]))

export function denominationByKey(key: DenominationKey): Denomination {
  const found = BY_KEY.get(key)
  if (!found) throw new Error(`Unknown denomination ${key}`)
  return found
}

export function isDenominationKey(value: unknown): value is DenominationKey {
  return typeof value === 'string' && BY_KEY.has(value)
}

function isCount(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** True when `value` is a count the database would accept. */
export function isValidCounts(value: unknown): value is DenominationCounts {
  if (!isPlainObject(value)) return false
  return Object.keys(value).every((key) => {
    if (key === LOOSE_COINS_KEY) return isCount(value[key], MAX_LOOSE_COINS_CENTS)
    return BY_KEY.has(key) && isCount(value[key], MAX_PIECES)
  })
}

/**
 * A stored or typed count → a fresh count holding only its non-zero rows, or
 * null when it isn't a valid count. Never hands back the object it was given.
 */
export function parseCounts(value: unknown): DenominationCounts | null {
  if (!isValidCounts(value)) return null
  const record = value as Record<string, number>
  const kept = Object.keys(record).filter((key) => record[key] > 0)
  return Object.freeze(Object.fromEntries(kept.map((key) => [key, record[key]]))) as DenominationCounts
}

/** Σ pieces × face value + loose coins, in centavos; null for an invalid count. */
export function countTotalCents(value: unknown): number | null {
  if (!isValidCounts(value)) return null
  const record = value as Record<string, number>
  const pieces = PH_DENOMINATIONS.reduce((sum, d) => sum + (record[d.key] ?? 0) * d.cents, 0)
  return pieces + (record[LOOSE_COINS_KEY] ?? 0)
}

/** One row's subtotal in centavos. */
export function lineCents(key: DenominationKey, count: number): number {
  return denominationByKey(key).cents * count
}

/** How many bills and how many coins a count holds ("47 bills · 65 coins"). */
export function pieceCounts(counts: DenominationCounts): { bills: number; coins: number } {
  return PH_DENOMINATIONS.reduce(
    (acc, d) => {
      const pieces = counts[d.key] ?? 0
      return d.kind === 'bill' ? { ...acc, bills: acc.bills + pieces } : { ...acc, coins: acc.coins + pieces }
    },
    { bills: 0, coins: 0 },
  )
}

function clampPieces(count: number): number {
  if (!Number.isFinite(count) || count <= 0) return 0
  return Math.min(MAX_PIECES, Math.floor(count))
}

function withoutKey(counts: DenominationCounts, key: string): DenominationCounts {
  const record = counts as Record<string, number>
  return Object.fromEntries(Object.keys(record).filter((k) => k !== key).map((k) => [k, record[k]]))
}

/** A new count with one row set (clamped to 0…MAX_PIECES; a zero row is dropped). */
export function setCount(counts: DenominationCounts, key: DenominationKey, count: number): DenominationCounts {
  const pieces = clampPieces(count)
  const rest = withoutKey(counts, key)
  return pieces === 0 ? rest : { ...rest, [key]: pieces }
}

/** + or − one piece. */
export function stepCount(counts: DenominationCounts, key: DenominationKey, delta: 1 | -1): DenominationCounts {
  return setCount(counts, key, (counts[key] ?? 0) + delta)
}

/** A new count with the loose-coins total set; null or 0 clears it. */
export function setLooseCoinsCents(counts: DenominationCounts, cents: number | null): DenominationCounts {
  const rest = withoutKey(counts, LOOSE_COINS_KEY)
  if (cents === null || !Number.isFinite(cents) || cents <= 0) return rest
  return { ...rest, [LOOSE_COINS_KEY]: Math.min(MAX_LOOSE_COINS_CENTS, Math.floor(cents)) }
}

export function usesLooseCoins(counts: DenominationCounts): boolean {
  return (counts.loose_coins_cents ?? 0) > 0
}

export type CountKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '00' | 'backspace' | 'clear'

/**
 * The count keypad: digits append to a row's piece count. A digit that would
 * pass MAX_PIECES is ignored, so a slip of the thumb never wipes the row.
 */
export function pressCountKey(count: number, key: CountKey): number {
  const current = clampPieces(count)
  if (key === 'clear') return 0
  if (key === 'backspace') return Math.floor(current / 10)
  const next = Number(`${current}${key}`)
  return next <= MAX_PIECES ? next : current
}
