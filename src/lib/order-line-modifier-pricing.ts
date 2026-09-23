/**
 * What one order line's options and add-ons are worth, priced from the dish's
 * OWN JSON — never from the price the browser put on the line.
 *
 * A line reaches the server with two descriptions of what the customer chose:
 *  - ids (`option_ids`, `addon_ids`, `addon_quantities`), which inventory and
 *    this module can price exactly;
 *  - display text (`variation`, `addons`), which is what the kitchen reads.
 *
 * Pricing only the ids would let a forged line drop them and keep the text —
 * "Large" printed on the ticket, base price on the bill. So both are priced:
 * every claimed id at its catalog price, and every piece of text the ids do not
 * already account for by name. The one asymmetry is deliberate: a NEGATIVE
 * option ("No rice −₱10") only discounts the line when the ticket names it, so
 * a discount can never be claimed for a change the kitchen never sees.
 *
 * Nothing here refuses. An id that is not on the dish (a stale cart after the
 * merchant edited the menu, or a forgery) is priced at nothing and reported;
 * its text, if any, is still priced by name. A refusal here would be invisible
 * behind the optimistic checkout screen and cost a real sale, and an unknown id
 * buys nothing that the text pricing does not already charge for.
 *
 * Pure: no queries, no mutation of its inputs.
 */

import { addonQuantity } from '@/lib/addon-quantity'

/** The modifier-bearing columns of a `menu_items` row, untrusted JSON. */
export interface ModifierCatalogSource {
  modifier_groups?: unknown
  variation_types?: unknown
  variations?: unknown
  addons?: unknown
}

/** A menu item referenced by a linked modifier option (`menu_item_id`). */
export interface LinkedModifierItem {
  id: string
  name: string
  price: number
  discounted_price?: number | null
}

/** The selection half of an order line. */
export interface ModifierSelectionLine {
  option_ids?: readonly string[]
  addon_ids?: readonly string[]
  addon_quantities?: Readonly<Record<string, number>>
  variation?: string | null
  addons?: readonly string[]
}

export interface ModifierPricing {
  /** Per-unit amount the options and add-ons add to the base price. */
  delta: number
  /** Claimed ids the dish does not carry. Priced at nothing. */
  unknownIds: string[]
  /** Display text that matched no option on the dish. Priced at nothing. */
  unpricedLabels: string[]
}

interface CatalogEntry {
  id: string
  name: string
  price: number
}

interface TextToken {
  name: string
  quantity: number
}

/** Variation text joins option names with this separator (see useCheckout). */
const VARIATION_SEPARATOR = ', '
/** Add-on labels carry portions as `Name ×2` (see `addonLabel`). */
const ADDON_PORTION_LABEL = /^(.*\S)\s*×(\d+)$/

const round = (value: number): number => Math.round(value * 100) / 100

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function toPrice(value: unknown): number | null {
  const numeric = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof numeric === 'number' && Number.isFinite(numeric) ? numeric : null
}

function normalizeName(name: string): string {
  return name.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()
}

/** Mirrors `effectivePrice` in modifier-linked-options.ts — what the storefront shows. */
function linkedPrice(item: LinkedModifierItem): number | null {
  const listPrice = toPrice(item.price)
  if (listPrice === null) return null
  const discounted = toPrice(item.discounted_price)
  return discounted !== null && discounted < listPrice ? discounted : listPrice
}

function entryFrom(raw: unknown, priceKey: 'price_modifier' | 'price'): CatalogEntry | null {
  const record = asRecord(raw)
  if (!record || typeof record.id !== 'string' || record.id === '') return null
  const price = toPrice(record[priceKey])
  if (price === null) return null
  return { id: record.id, name: typeof record.name === 'string' ? record.name : '', price }
}

function modifierOptionEntry(
  raw: unknown,
  linkedItems: ReadonlyMap<string, LinkedModifierItem>
): CatalogEntry | null {
  const record = asRecord(raw)
  const linkedId = record && typeof record.menu_item_id === 'string' ? record.menu_item_id : ''
  if (!record || linkedId === '') return entryFrom(raw, 'price_modifier')

  // A linked option is a live reference: its name and price come from the
  // linked dish. A dish that no longer exists makes the option unorderable.
  const linked = linkedItems.get(linkedId)
  const price = linked ? linkedPrice(linked) : null
  if (!linked || price === null || typeof record.id !== 'string' || record.id === '') return null
  return { id: record.id, name: linked.name, price }
}

/** Every option and add-on the dish carries, in every shape it may be stored in. */
function buildCatalog(
  source: ModifierCatalogSource,
  linkedItems: ReadonlyMap<string, LinkedModifierItem>
): CatalogEntry[] {
  const groupOptions = asArray(source.modifier_groups).flatMap((group) =>
    asArray(asRecord(group)?.options).map((option) => modifierOptionEntry(option, linkedItems))
  )
  const typeOptions = asArray(source.variation_types).flatMap((type) =>
    asArray(asRecord(type)?.options).map((option) => entryFrom(option, 'price_modifier'))
  )
  const flatVariations = asArray(source.variations).map((option) => entryFrom(option, 'price_modifier'))
  const addons = asArray(source.addons).map((addon) => entryFrom(addon, 'price'))

  return [...groupOptions, ...typeOptions, ...flatVariations, ...addons].filter(
    (entry): entry is CatalogEntry => entry !== null
  )
}

/**
 * Index by a key, keeping the CHEAPEST entry when one key appears twice (an
 * item carrying both `modifier_groups` and the legacy columns). Cheapest is the
 * direction that can never overcharge a real customer.
 */
function indexCheapest(entries: readonly CatalogEntry[], keyOf: (entry: CatalogEntry) => string): Map<string, CatalogEntry> {
  return entries.reduce((index, entry) => {
    const key = keyOf(entry)
    const existing = index.get(key)
    return !existing || entry.price < existing.price ? new Map(index).set(key, entry) : index
  }, new Map<string, CatalogEntry>())
}

/** Split the variation text into option names, keeping comma-bearing names whole. */
function variationTokens(variation: string, catalog: readonly CatalogEntry[]): TextToken[] {
  const commaNames = [...new Set(catalog.map((entry) => entry.name))]
    .filter((name) => name.includes(VARIATION_SEPARATOR))
    .sort((a, b) => b.length - a.length)

  const { remaining, whole } = commaNames.reduce(
    (state, name) =>
      state.remaining.includes(name)
        ? { remaining: state.remaining.replace(name, ''), whole: [...state.whole, name] }
        : state,
    { remaining: variation, whole: [] as string[] }
  )

  const split = remaining
    .split(VARIATION_SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => part !== '')

  return [...whole, ...split].map((name) => ({ name, quantity: 1 }))
}

function addonTokens(labels: readonly string[]): TextToken[] {
  return labels
    .filter((label) => label.trim() !== '')
    .map((label) => {
      const portions = ADDON_PORTION_LABEL.exec(label.trim())
      return portions
        ? { name: portions[1], quantity: Number(portions[2]) }
        : { name: label.trim(), quantity: 1 }
    })
}

interface Claim {
  entry: CatalogEntry
  quantity: number
}

/** Claimed ids resolved against the catalog, plus the ids that matched nothing. */
function resolveClaims(line: ModifierSelectionLine, byId: ReadonlyMap<string, CatalogEntry>) {
  const optionClaims = (line.option_ids ?? []).map((id) => ({ id, quantity: 1 }))
  const addonClaims = (line.addon_ids ?? []).map((id) => ({
    id,
    quantity: addonQuantity({ quantity: line.addon_quantities?.[id] }),
  }))

  const all = [...optionClaims, ...addonClaims]
  const claims: Claim[] = all.flatMap(({ id, quantity }) => {
    const entry = byId.get(id)
    return entry ? [{ entry, quantity }] : []
  })
  const unknownIds = all.filter(({ id }) => !byId.has(id)).map(({ id }) => id)
  return { claims, unknownIds }
}

/**
 * Match text tokens to claimed names. Returns the names the ticket shows and
 * the tokens no claim accounts for.
 */
function matchTokensToClaims(tokens: readonly TextToken[], claims: readonly Claim[]) {
  const available = claims.reduce(
    (counts, claim) => {
      const key = normalizeName(claim.entry.name)
      return { ...counts, [key]: (counts[key] ?? 0) + claim.quantity }
    },
    {} as Record<string, number>
  )

  return tokens.reduce(
    (state, token) => {
      const key = normalizeName(token.name)
      const left = state.available[key] ?? 0
      if (left >= token.quantity) {
        return {
          ...state,
          available: { ...state.available, [key]: left - token.quantity },
          visible: new Set(state.visible).add(key),
        }
      }
      return { ...state, uncovered: [...state.uncovered, token] }
    },
    { available, visible: new Set<string>(), uncovered: [] as TextToken[] }
  )
}

/** Ids of the menu items this dish's linked modifier options point at, so the caller can fetch them. */
export function collectLinkedModifierItemIds(source: ModifierCatalogSource): string[] {
  const ids = asArray(source.modifier_groups).flatMap((group) =>
    asArray(asRecord(group)?.options).flatMap((option) => {
      const linkedId = asRecord(option)?.menu_item_id
      return typeof linkedId === 'string' && linkedId !== '' ? [linkedId] : []
    })
  )
  return [...new Set(ids)]
}

/** Price the options and add-ons on one line. See the module comment. */
export function priceLineModifiers(
  line: ModifierSelectionLine,
  source: ModifierCatalogSource,
  linkedItems: ReadonlyMap<string, LinkedModifierItem>
): ModifierPricing {
  const catalog = buildCatalog(source, linkedItems)
  const byId = indexCheapest(catalog, (entry) => entry.id)
  const byName = indexCheapest(
    catalog.filter((entry) => entry.name.trim() !== ''),
    (entry) => normalizeName(entry.name)
  )

  const { claims, unknownIds } = resolveClaims(line, byId)
  const tokens = [
    ...variationTokens(line.variation ?? '', catalog),
    ...addonTokens(line.addons ?? []),
  ]
  const { visible, uncovered } = matchTokensToClaims(tokens, claims)

  const claimedTotal = claims.reduce((sum, { entry, quantity }) => {
    const isHiddenDiscount = entry.price < 0 && !visible.has(normalizeName(entry.name))
    return isHiddenDiscount ? sum : sum + entry.price * quantity
  }, 0)

  const textTotal = uncovered.reduce((sum, token) => {
    const entry = byName.get(normalizeName(token.name))
    return entry ? sum + entry.price * token.quantity : sum
  }, 0)

  const unpricedLabels = uncovered
    .filter((token) => !byName.has(normalizeName(token.name)))
    .map((token) => token.name)

  return { delta: round(claimedTotal + textTotal), unknownIds, unpricedLabels }
}
