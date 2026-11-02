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
 * buys nothing that the text pricing does not already charge for. Picks the
 * store switched off are REPORTED (`unavailableNames`) for the caller to
 * refuse, and the ids the text was charged for are reported too
 * (`textOptionIds`/`textAddonIds`), so inventory spends what the bill says.
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
  /** An unavailable linked dish makes the option unorderable (see modifier-linked-options.ts). */
  is_available?: boolean | null
}

/** The selection half of an order line. */
export interface ModifierSelectionLine {
  option_ids?: readonly string[]
  addon_ids?: readonly string[]
  addon_quantities?: Readonly<Record<string, number>>
  variation?: string | null
  addons?: readonly string[]
}

/**
 * One add-on on a priced line, as stored in `order_items.addon_details`.
 * `price` is per portion from the dish's own JSON; null when the dish does not
 * carry it any more (nothing was charged for it, but the kitchen still saw it).
 */
export interface OrderLineAddonDetail {
  name: string
  price: number | null
  quantity: number
}

export interface ModifierPricing {
  /** Per-unit amount the options and add-ons add to the base price. */
  delta: number
  /** Each add-on on the line with its catalog price and portions. */
  addons: OrderLineAddonDetail[]
  /** Claimed ids the dish does not carry. Priced at nothing. */
  unknownIds: string[]
  /** Display text that matched no option on the dish. Priced at nothing. */
  unpricedLabels: string[]
  /**
   * Option ids the variation TEXT named and no claimed id accounted for —
   * charged by name above, so inventory must spend them too.
   */
  textOptionIds: string[]
  /** Add-on ids the add-on TEXT named and no claimed id accounted for. */
  textAddonIds: string[]
  /** Portions of those text add-ons, per id; absent means one. */
  textAddonQuantities: Record<string, number>
  /** Picks on the line (by id or by text) the store has switched off right now. */
  unavailableNames: string[]
}

interface CatalogEntry {
  id: string
  name: string
  price: number
  /** False when the merchant switched the option off, or its linked dish is unavailable. */
  isAvailable: boolean
}

interface TextToken {
  name: string
  quantity: number
  /** Which half of the line the text came from. */
  source: 'option' | 'addon'
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
  return {
    id: record.id,
    name: typeof record.name === 'string' ? record.name : '',
    price,
    isAvailable: record.is_available !== false,
  }
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
  return {
    id: record.id,
    name: linked.name,
    price,
    isAvailable: record.is_available !== false && linked.is_available !== false,
  }
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

  return [...whole, ...split].map((name) => ({ name, quantity: 1, source: 'option' as const }))
}

function addonTokens(labels: readonly string[]): TextToken[] {
  return labels
    .filter((label) => label.trim() !== '')
    .map((label) => {
      const portions = ADDON_PORTION_LABEL.exec(label.trim())
      return portions
        ? { name: portions[1], quantity: Number(portions[2]), source: 'addon' as const }
        : { name: label.trim(), quantity: 1, source: 'addon' as const }
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

/**
 * The add-on half of the line, one entry per add-on: every claimed add-on id at
 * its catalog price, then every add-on label those ids do not account for,
 * priced by name exactly as `priceLineModifiers` charges it.
 */
function describeAddons(
  line: ModifierSelectionLine,
  byId: ReadonlyMap<string, CatalogEntry>,
  byName: ReadonlyMap<string, CatalogEntry>
): OrderLineAddonDetail[] {
  const claimed = (line.addon_ids ?? []).flatMap((id) => {
    const entry = byId.get(id)
    const quantity = addonQuantity({ quantity: line.addon_quantities?.[id] })
    return entry && quantity > 0 ? [{ entry, quantity }] : []
  })
  const { uncovered } = matchTokensToClaims(addonTokens(line.addons ?? []), claimed)

  return [
    ...claimed.map(({ entry, quantity }) => ({ name: entry.name, price: entry.price, quantity })),
    ...uncovered.map((token) => ({
      name: token.name,
      price: byName.get(normalizeName(token.name))?.price ?? null,
      quantity: token.quantity,
    })),
  ]
}

interface TextSelection {
  textOptionIds: string[]
  textAddonIds: string[]
  textAddonQuantities: Record<string, number>
}

/**
 * The catalog ids behind the text no claimed id accounted for: the very
 * entries `priceLineModifiers` charged by name, so depletion spends what the
 * bill says. Variation text yields option ids, add-on text add-on ids (with
 * portions summed per id).
 */
function textSelection(
  uncovered: readonly TextToken[],
  byName: ReadonlyMap<string, CatalogEntry>
): TextSelection {
  const matched = uncovered.flatMap((token) => {
    const entry = byName.get(normalizeName(token.name))
    return entry ? [{ id: entry.id, token }] : []
  })
  const addonPortions = matched
    .filter(({ token }) => token.source === 'addon')
    .reduce(
      (portions, { id, token }) => ({ ...portions, [id]: (portions[id] ?? 0) + token.quantity }),
      {} as Record<string, number>
    )
  return {
    textOptionIds: [...new Set(matched.filter(({ token }) => token.source === 'option').map(({ id }) => id))],
    textAddonIds: Object.keys(addonPortions),
    textAddonQuantities: Object.fromEntries(Object.entries(addonPortions).filter(([, portions]) => portions !== 1)),
  }
}

/**
 * Picks on the line that cannot be ordered right now. An id is off when ANY
 * stored copy of it says so — the unified editor mirrors every option into the
 * legacy columns under the same id, without the flag, and that mirror must not
 * switch it back on. Text is off only when every option carrying that name is.
 */
function findUnavailableNames(
  catalog: readonly CatalogEntry[],
  claims: readonly Claim[],
  uncovered: readonly TextToken[]
): string[] {
  const offIds = new Set(catalog.filter((entry) => !entry.isAvailable).map((entry) => entry.id))
  if (offIds.size === 0) return []
  const isNameOrderable = (key: string) =>
    catalog.some((entry) => normalizeName(entry.name) === key && !offIds.has(entry.id))
  const isNameOnDish = (key: string) => catalog.some((entry) => normalizeName(entry.name) === key)

  const claimed = claims.filter(({ entry }) => offIds.has(entry.id)).map(({ entry }) => entry.name || entry.id)
  const named = uncovered
    .filter((token) => {
      const key = normalizeName(token.name)
      return isNameOnDish(key) && !isNameOrderable(key)
    })
    .map((token) => token.name)
  return [...new Set([...claimed, ...named])]
}

/**
 * The line with the ids its text was charged for added to its own, so the
 * stored order (and every stock guard and depletion that reads ids) agrees
 * with the bill. Pricing the returned line again gives the same delta: the
 * added ids now cover the text that used to be priced by name. Returns a new
 * line; the input is never mutated.
 */
export function withTextSelectionIds<T extends ModifierSelectionLine>(line: T, pricing: TextSelection): T {
  if (pricing.textOptionIds.length === 0 && pricing.textAddonIds.length === 0) return line
  const optionIds = [...new Set([...(line.option_ids ?? []), ...pricing.textOptionIds])]
  const addonIds = [...new Set([...(line.addon_ids ?? []), ...pricing.textAddonIds])]
  const quantities = pricing.textAddonIds.reduce(
    (portions, id) => {
      const fromText = pricing.textAddonQuantities[id] ?? 1
      const total = (line.addon_ids ?? []).includes(id)
        ? addonQuantity({ quantity: line.addon_quantities?.[id] }) + fromText
        : fromText
      return total === 1 ? portions : { ...portions, [id]: total }
    },
    { ...(line.addon_quantities ?? {}) } as Record<string, number>
  )
  return {
    ...line,
    option_ids: optionIds,
    addon_ids: addonIds,
    ...(Object.keys(quantities).length > 0 ? { addon_quantities: quantities } : {}),
  }
}

/** The diner's sentence when a pick on a line is switched off right now. */
export function unavailablePickMessage(dishName: string, pickNames: readonly string[]): string {
  const picks = pickNames.join(', ')
  const verb = pickNames.length === 1 ? 'is' : 'are'
  return `Sorry — ${picks} for ${dishName} ${verb} not available right now. Please remove ${pickNames.length === 1 ? 'it' : 'them'} from your cart and try again.`
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

  return {
    delta: round(claimedTotal + textTotal),
    addons: describeAddons(line, byId, byName),
    unknownIds,
    unpricedLabels,
    ...textSelection(uncovered, byName),
    unavailableNames: findUnavailableNames(catalog, claims, uncovered),
  }
}
