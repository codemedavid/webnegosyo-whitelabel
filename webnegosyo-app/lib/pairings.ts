/**
 * "What do customers order together?" — market-basket analysis over the sold
 * lines of a window, at two levels: individual items and whole categories.
 *
 * Counts ORDERS, not lines: a basket holding two burgers is one burger order,
 * so a party order cannot outweigh twenty ordinary ones.
 *
 * Raw co-occurrence alone misleads: rice is in most orders, so it shares an
 * order with everything. Each pair therefore carries:
 * - `share`        — the partner is in this fraction of the anchor's orders
 *                    (read in the stronger direction);
 * - `reverseShare` — the same, read the other way;
 * - `lift`         — how much more often they meet than chance would put them
 *                    together. 1 or below is coincidence, not a pattern.
 *
 * Mirrors the web's `src/lib/boost/pair-insights.ts` so both surfaces agree on
 * what a pair is. Pure and deterministic.
 */

export type PairStrength = "always" | "often" | "sometimes";

/** Which Boost Sales offer a pair is the raw material for. */
export type PairSuggestion = "combo" | "pairing";

export interface PairingLine {
  orderId: string;
  menuItemId: string;
  /** What the order recorded — names a product that has since left the menu. */
  menuItemName: string;
}

export interface PairingCatalogItem {
  id: string;
  name: string;
  categoryId: string | null;
}

export interface PairingCategory {
  id: string;
  name: string;
}

export interface NamedRef {
  id: string;
  name: string;
}

export interface PairRow {
  /** The side whose orders most often include the partner. */
  anchor: NamedRef;
  partner: NamedRef;
  /** Orders holding both. */
  together: number;
  /** together / anchor orders, 0–1. */
  share: number;
  /** together / partner orders, 0–1. */
  reverseShare: number;
  /** Observed / expected by chance. 1 = no relationship. */
  lift: number;
  strength: PairStrength;
  suggestion: PairSuggestion | null;
}

export interface Partner {
  id: string;
  name: string;
  together: number;
  /** together / orders holding the item, 0–1. */
  share: number;
}

export interface ItemPartners {
  item: NamedRef;
  categoryName: string;
  /** Orders holding the item. */
  orders: number;
  partners: Partner[];
}

export interface PairingInsights {
  /** Orders with at least one product line. */
  orderCount: number;
  /** Orders holding two or more different products. */
  multiItemOrders: number;
  multiItemShare: number;
  /** Different products per order, on average. */
  avgItemsPerOrder: number;
  itemPairs: PairRow[];
  categoryPairs: PairRow[];
  /** The most-ordered items, each with what most often rides along. */
  partnersByItem: ItemPartners[];
}

export interface PairingLimits {
  itemPairs: number;
  categoryPairs: number;
  partnersByItem: number;
  partnersPerItem: number;
}

export interface PairingInput {
  lines: readonly PairingLine[];
  catalog: readonly PairingCatalogItem[];
  categories: readonly PairingCategory[];
  limits?: Partial<PairingLimits>;
}

const DEFAULT_LIMITS: PairingLimits = {
  itemPairs: 25,
  categoryPairs: 12,
  partnersByItem: 15,
  partnersPerItem: 3,
};

/** Fewer shared orders than this is coincidence at the item level. */
const MIN_ITEM_TOGETHER = 2;
const ALWAYS_SHARE = 0.6;
const OFTEN_SHARE = 0.3;
const UNCATEGORIZED_ID = "__uncategorized__";
const UNCATEGORIZED_NAME = "Uncategorized";

export function pairStrength(share: number): PairStrength {
  if (share >= ALWAYS_SHARE) return "always";
  if (share >= OFTEN_SHARE) return "often";
  return "sometimes";
}

function suggestionFor(strength: PairStrength): PairSuggestion | null {
  if (strength === "always") return "combo";
  if (strength === "often") return "pairing";
  return null;
}

function round(value: number, places = 4): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

// --- basket counting ---------------------------------------------------------

interface BasketStats {
  orderCount: number;
  /** Orders containing each key. */
  keyOrders: ReadonlyMap<string, number>;
  /** Orders containing both keys, keyed by `pairKey`. */
  pairOrders: ReadonlyMap<string, number>;
}

const PAIR_SEPARATOR = "\u0000";

function pairKey(a: string, b: string): string {
  return a < b ? `${a}${PAIR_SEPARATOR}${b}` : `${b}${PAIR_SEPARATOR}${a}`;
}

function countBaskets(baskets: readonly ReadonlySet<string>[]): BasketStats {
  const keyOrders = new Map<string, number>();
  const pairOrders = new Map<string, number>();

  for (const basket of baskets) {
    const keys = [...basket].sort();
    for (let i = 0; i < keys.length; i += 1) {
      keyOrders.set(keys[i], (keyOrders.get(keys[i]) ?? 0) + 1);
      for (let j = i + 1; j < keys.length; j += 1) {
        const key = pairKey(keys[i], keys[j]);
        pairOrders.set(key, (pairOrders.get(key) ?? 0) + 1);
      }
    }
  }

  return { orderCount: baskets.length, keyOrders, pairOrders };
}

interface PairOptions {
  minTogether: number;
  aboveChanceOnly: boolean;
  limit: number;
  nameOf: (id: string) => string;
}

function toPairRow(stats: BasketStats, a: string, b: string, together: number, nameOf: (id: string) => string): PairRow | null {
  const aOrders = stats.keyOrders.get(a) ?? 0;
  const bOrders = stats.keyOrders.get(b) ?? 0;
  if (aOrders === 0 || bOrders === 0 || stats.orderCount === 0) return null;

  const aShare = together / aOrders;
  const bShare = together / bOrders;
  // Orient toward the stronger direction; ties keep the key order.
  const isAAnchor = aShare >= bShare;
  const anchorId = isAAnchor ? a : b;
  const partnerId = isAAnchor ? b : a;
  const share = isAAnchor ? aShare : bShare;
  const support = together / stats.orderCount;
  const lift = support / ((aOrders / stats.orderCount) * (bOrders / stats.orderCount));
  const strength = pairStrength(share);

  return {
    anchor: { id: anchorId, name: nameOf(anchorId) },
    partner: { id: partnerId, name: nameOf(partnerId) },
    together,
    share: round(share),
    reverseShare: round(isAAnchor ? bShare : aShare),
    lift: round(lift, 2),
    strength,
    suggestion: suggestionFor(strength),
  };
}

function rankPairs(stats: BasketStats, options: PairOptions): PairRow[] {
  const rows: PairRow[] = [];
  for (const [key, together] of stats.pairOrders) {
    if (together < options.minTogether) continue;
    const [a, b] = key.split(PAIR_SEPARATOR);
    const row = toPairRow(stats, a, b, together, options.nameOf);
    if (!row) continue;
    if (options.aboveChanceOnly && row.lift <= 1) continue;
    rows.push(row);
  }

  return rows
    .sort(
      (x, y) =>
        y.together - x.together ||
        y.lift - x.lift ||
        x.anchor.id.localeCompare(y.anchor.id) ||
        x.partner.id.localeCompare(y.partner.id)
    )
    .slice(0, options.limit);
}

/** Every item's partners from one pass over the pairs, strongest first. */
function partnersByKey(stats: BasketStats, limit: number, nameOf: (id: string) => string): Map<string, Partner[]> {
  const byItem = new Map<string, Partner[]>();
  const add = (itemId: string, otherId: string, together: number) => {
    const itemOrders = stats.keyOrders.get(itemId) ?? 0;
    if (itemOrders === 0) return;
    const partner = { id: otherId, name: nameOf(otherId), together, share: round(together / itemOrders) };
    // A local accumulator: copying the list on every pair is quadratic on a big menu.
    const list = byItem.get(itemId);
    if (list) list.push(partner);
    else byItem.set(itemId, [partner]);
  };

  for (const [key, together] of stats.pairOrders) {
    if (together < MIN_ITEM_TOGETHER) continue;
    const [a, b] = key.split(PAIR_SEPARATOR);
    add(a, b, together);
    add(b, a, together);
  }

  return new Map(
    [...byItem].map(([itemId, partners]) => [
      itemId,
      [...partners].sort((x, y) => y.together - x.together || x.id.localeCompare(y.id)).slice(0, limit),
    ])
  );
}

// --- the screen's summary ----------------------------------------------------

function groupBaskets(lines: readonly PairingLine[]): Map<string, Set<string>> {
  const byOrder = new Map<string, Set<string>>();
  for (const line of lines) {
    if (!line.orderId || !line.menuItemId) continue;
    const basket = byOrder.get(line.orderId) ?? new Set<string>();
    basket.add(line.menuItemId);
    byOrder.set(line.orderId, basket);
  }
  return byOrder;
}

export function buildPairingInsights(input: PairingInput): PairingInsights {
  const limits: PairingLimits = { ...DEFAULT_LIMITS, ...input.limits };

  // Recorded names first, so a product that left the menu is still named;
  // the live menu's name wins for everything still on it.
  const itemNames = new Map<string, string>();
  for (const line of input.lines) itemNames.set(line.menuItemId, line.menuItemName);
  for (const item of input.catalog) itemNames.set(item.id, item.name);

  const categoryOfItem = new Map(input.catalog.map((item) => [item.id, item.categoryId ?? UNCATEGORIZED_ID]));
  const categoryNames = new Map(input.categories.map((category) => [category.id, category.name]));
  const categoryKeyOf = (itemId: string): string => {
    const categoryId = categoryOfItem.get(itemId) ?? UNCATEGORIZED_ID;
    // A category deleted since still has items pointing at nothing.
    return categoryNames.has(categoryId) ? categoryId : UNCATEGORIZED_ID;
  };
  const itemNameOf = (id: string) => itemNames.get(id) || "Unnamed item";
  const categoryNameOf = (id: string) => categoryNames.get(id) ?? UNCATEGORIZED_NAME;

  const itemBaskets = [...groupBaskets(input.lines).values()];
  const categoryBaskets = itemBaskets.map((basket) => new Set([...basket].map(categoryKeyOf)));

  const itemStats = countBaskets(itemBaskets);
  const categoryStats = countBaskets(categoryBaskets);

  const orderCount = itemStats.orderCount;
  const multiItemOrders = itemBaskets.filter((basket) => basket.size >= 2).length;
  const distinctItems = itemBaskets.reduce((sum, basket) => sum + basket.size, 0);

  const partnersOfItem = partnersByKey(itemStats, limits.partnersPerItem, itemNameOf);
  const partnersByItem = [...itemStats.keyOrders.entries()]
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
    .map(([itemId, orders]) => ({
      item: { id: itemId, name: itemNameOf(itemId) },
      categoryName: categoryNameOf(categoryKeyOf(itemId)),
      orders,
      partners: partnersOfItem.get(itemId) ?? [],
    }))
    .filter((entry) => entry.partners.length > 0)
    .slice(0, limits.partnersByItem);

  return {
    orderCount,
    multiItemOrders,
    multiItemShare: orderCount === 0 ? 0 : round(multiItemOrders / orderCount),
    avgItemsPerOrder: orderCount === 0 ? 0 : round(distinctItems / orderCount),
    itemPairs: rankPairs(itemStats, {
      minTogether: MIN_ITEM_TOGETHER,
      aboveChanceOnly: true,
      limit: limits.itemPairs,
      nameOf: itemNameOf,
    }),
    // A store has a handful of categories, and the big ones (drinks) sit in
    // most orders — so every observed cross-category pair is shown, by volume.
    categoryPairs: rankPairs(categoryStats, {
      minTogether: 1,
      aboveChanceOnly: false,
      limit: limits.categoryPairs,
      nameOf: categoryNameOf,
    }),
    partnersByItem,
  };
}
