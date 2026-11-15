/**
 * Customers who type their order instead of tapping (plan
 * `docs/plans/2026-11-15-messenger-reply-from-app.md` §7, T1 + T2). No AI:
 * words are folded and matched against THIS store's dish names.
 *
 * - `findDishes`: the dishes a message names, with how many ("2 inasal",
 *   "dalawang halo-halo", "sisig x3"). The merchant app runs a byte-identical
 *   copy (`webnegosyo-app/lib/messenger-chat/typed-order.ts`) to offer "Found in
 *   chat" on Take order; `tests/unit/messenger/typed-order-parity.test.ts`
 *   fails when the two drift.
 * - `readsLikeOrder`: the bot's call (T1). A dish plus an order word or a
 *   quantity, or an order word plus a quantity. "Magkano ang sisig?" (a dish,
 *   no order word, no number) is a question, not an order, and so is anything
 *   asking where an order is ("where is my order 7").
 *
 * Pure and browser-safe (the Studio's chat simulator runs it too).
 */

export interface DishName {
  id: string
  name: string
}

export interface FoundDish {
  id: string
  name: string
  /** How many they asked for; 1 when no number was given. */
  qty: number
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  isa: 1, isang: 1, dalawa: 2, dalawang: 2, tatlo: 3, tatlong: 3, apat: 4, lima: 5, limang: 5,
  anim: 6, pito: 7, pitong: 7, walo: 8, walong: 8, siyam: 9, sampu: 10, sampung: 10,
  a: 1, an: 1,
}

/** Words that only ever mean "how many" when written next to a number. */
const QTY_SUFFIX = new Set(['x', 'pcs', 'pc', 'piece', 'pieces', 'order', 'orders', 'na', 'ng', 'serving', 'servings'])

const ORDER_WORDS = new Set([
  'order', 'orders', 'paorder', 'pabili', 'bili', 'bibili', 'pabile', 'pakuha', 'kuha', 'kukuha',
  'padeliver', 'deliver', 'pickup', 'reserve', 'pareserve', 'pakibigay', 'gusto',
])

/** Two-word order phrases, folded ("pa order", "i want", "can i"). */
const ORDER_PHRASES = ['pa order', 'pa deliver', 'pa reserve', 'pick up', 'i want', 'can i', 'id like', 'i d like', 'gusto ko', 'gusto namin']

/**
 * Words that ask about an order already placed ("where is my order 7",
 * "asan na po order ko"): the "Where is my order" reply answers those, never
 * the typed-order handover.
 */
const STATUS_WORDS = new Set([
  'where', 'status', 'track', 'tracking', 'eta', 'arrive', 'arrived',
  'nasaan', 'nasan', 'asan', 'saan', 'kailan', 'darating', 'dumating',
])

/** Generic words a customer drops when naming a dish ("Chicken Inasal Meal" typed as "inasal"). */
const GENERIC = new Set(['the', 'with', 'and', 'w', 'meal', 'set', 'solo', 'regular', 'special', 'ng', 'sa', 'na', 'mga', 'combo'])

/** Lowercase, no accents, letters and digits only, single spaces. "Halo-Halo!" → "halo halo". */
export function foldWords(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/(\d)\s*x\b/g, '$1 x ')
    .replace(/\bx\s*(\d)/g, ' x $1')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function asNumber(token: string | undefined): number | null {
  if (token === undefined) return null
  if (/^\d{1,2}$/.test(token)) {
    const value = Number(token)
    return value >= 1 && value <= 50 ? value : null
  }
  return NUMBER_WORDS[token] ?? null
}

/** Where a dish's words sit in the message: [start, end) token positions. */
function findPhrase(tokens: readonly string[], phrase: readonly string[]): number {
  outer: for (let start = 0; start + phrase.length <= tokens.length; start += 1) {
    for (let offset = 0; offset < phrase.length; offset += 1) {
      if (tokens[start + offset] !== phrase[offset]) continue outer
    }
    return start
  }
  return -1
}

/** The number written just before the dish ("2 inasal", "apat na inasal") or just after ("inasal x2", "inasal 2"). */
function quantityAround(tokens: readonly string[], start: number, end: number): number | null {
  const before = asNumber(tokens[start - 1])
  if (before !== null) return before
  if (QTY_SUFFIX.has(tokens[start - 1] ?? '')) {
    const twoBack = asNumber(tokens[start - 2])
    if (twoBack !== null) return twoBack
  }
  if (tokens[end] === 'x') return asNumber(tokens[end + 1])
  return asNumber(tokens[end])
}

interface Candidate extends FoundDish {
  start: number
  length: number
}

/**
 * The dishes a message names, longest name first so "Chicken Inasal Paa" wins
 * over "Chicken Inasal" on the same words. Each place in the message counts
 * once; a dish named twice keeps the first.
 */
export function findDishes(text: string, dishes: readonly DishName[]): FoundDish[] {
  const tokens = foldWords(text).split(' ').filter(Boolean)
  if (tokens.length === 0) return []

  const candidates: Candidate[] = []
  for (const dish of dishes) {
    const full = foldWords(dish.name).split(' ').filter(Boolean)
    if (full.join('').length < 3) continue
    const core = full.filter((word) => !GENERIC.has(word))
    const phrases = core.length > 0 && core.length < full.length ? [full, core] : [full]
    for (const phrase of phrases) {
      if (phrase.join('').length < 3) continue
      const start = findPhrase(tokens, phrase)
      if (start < 0) continue
      const qty = quantityAround(tokens, start, start + phrase.length) ?? 1
      candidates.push({ id: dish.id, name: dish.name, qty, start, length: phrase.length })
      break
    }
  }

  candidates.sort((a, b) => b.length - a.length || a.start - b.start)
  const taken = new Set<number>()
  const found: Candidate[] = []
  for (const candidate of candidates) {
    const positions = Array.from({ length: candidate.length }, (_, index) => candidate.start + index)
    if (positions.some((position) => taken.has(position))) continue
    if (found.some((entry) => entry.id === candidate.id)) continue
    positions.forEach((position) => taken.add(position))
    found.push(candidate)
  }
  return found.sort((a, b) => a.start - b.start).map(({ id, name, qty }) => ({ id, name, qty }))
}

function hasOrderWord(tokens: readonly string[], folded: string): boolean {
  if (tokens.some((token) => ORDER_WORDS.has(token))) return true
  return ORDER_PHRASES.some((phrase) => ` ${folded} `.includes(` ${phrase} `))
}

function hasQuantity(tokens: readonly string[]): boolean {
  // "a"/"an" are too common to mean a quantity on their own.
  return tokens.some((token) => token !== 'a' && token !== 'an' && asNumber(token) !== null)
}

/** T1: does this typed message read like an order at this store? */
export function readsLikeOrder(text: string, dishes: readonly DishName[]): { isOrder: boolean; found: FoundDish[] } {
  const folded = foldWords(text)
  const tokens = folded.split(' ').filter(Boolean)
  if (tokens.length === 0) return { isOrder: false, found: [] }
  const found = findDishes(text, dishes)
  if (tokens.some((token) => STATUS_WORDS.has(token))) return { isOrder: false, found }
  const orderWord = hasOrderWord(tokens, folded)
  const quantity = hasQuantity(tokens)
  const isOrder = found.length > 0 ? orderWord || quantity : orderWord && quantity && tokens.length >= 3
  return { isOrder, found }
}
