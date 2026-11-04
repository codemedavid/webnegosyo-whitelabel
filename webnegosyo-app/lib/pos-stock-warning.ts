/**
 * The register's stock check — a WARNING, deliberately never a refusal.
 *
 * The web checkout REFUSES a cart the kitchen cannot fill
 * (`src/lib/inventory/checkout-stock-guard.ts` on the platform). That is right
 * there: nobody is standing over the customer, and they can fix the cart
 * themselves in the seconds it takes to read the message.
 *
 * The register is the opposite situation in every respect. A cashier is facing
 * a paying customer with a queue behind them, can see the shelf with their own
 * eyes, and routinely knows things the ledger does not — a delivery that
 * arrived and has not been keyed in, a stocktake nobody ran, a recipe that
 * over-states what a portion really uses. Turning a software estimate into a
 * refused, in-person, cash-in-hand sale is a far worse trade than overselling
 * by one. So the register is TOLD — when the dish is added, and again at
 * Charge — and the human decides ("Sell anyway").
 *
 * What DOES refuse is the merchant's own switch: a dish or option marked sold
 * out (`isOptionAvailable`, `is_available`). That is a decision, not an
 * estimate, so the words "sold out" are reserved for it and never appear here.
 *
 * Ceilings come from the platform's `/api/inventory/ceilings`, so the register
 * and the storefront quote the same numbers: one per dish, plus one per
 * recipe-tracked option of that dish. A line is judged by its CONFIGURATION —
 * the tightest of the dish's ceiling and each picked option's — exactly like
 * the web's `configurationCeiling` (`src/lib/inventory/option-availability.ts`,
 * pinned by `pos-stock-warning.test.ts`).
 */

import type { PosCartLine } from "./pos-cart";
import { buildPosStockItems, type PosStockItem } from "./pos-stock";
import { posStockRevision } from "./pos-stock-revision";
import type { PosStockPolicy } from "./pos-stock-decision";

/** What the platform said the kitchen can make. Absent means no ceiling. */
export interface PosStockCeilings {
  /** Menu item id → whole units producible. */
  dishes: ReadonlyMap<string, number>;
  /** Menu item id → option id → units of that dish producible with that option. */
  options: ReadonlyMap<string, ReadonlyMap<string, number>>;
  /** The store's rule for selling past the count (`stockPolicy`); absent = warn. */
  stockPolicy?: PosStockPolicy;
}

/** No read yet, or none possible. "No opinion" — never "empty shelves". */
export const NO_STOCK_CEILINGS: PosStockCeilings = {
  dishes: new Map(),
  options: new Map(),
};

export function hasStockCeilings(ceilings: PosStockCeilings): boolean {
  return ceilings.dishes.size > 0 || ceilings.options.size > 0;
}

export interface StockDemandOption {
  id: string;
  name: string;
}

/** Units of one configuration the sale asks the kitchen for. */
export interface StockDemandLine {
  menuItemId: string;
  name: string;
  quantity: number;
  options: readonly StockDemandOption[];
}

/** One dish (or dish + option) the sale asks for more of than the estimate. */
export interface StockShortfall {
  menuItemId: string;
  dishName: string;
  /** The picked option whose shelf is the binding one; null for the dish's own. */
  optionName: string | null;
  /** That option's id (null with `optionName`), so a "Sell N" can find its lines. */
  optionId: string | null;
  producible: number;
  wanted: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/**
 * `optionCeilings` from the ceilings route, as maps. Mirror of the web's
 * `parseOptionCeilings`: it crossed the network, so anything malformed is
 * dropped — a bad entry means "no opinion", never "none left".
 */
export function parseOptionCeilings(raw: unknown): Map<string, Map<string, number>> {
  if (!isRecord(raw)) return new Map();
  const dishes = new Map<string, Map<string, number>>();
  for (const [menuItemId, byOption] of Object.entries(raw)) {
    if (!isRecord(byOption)) continue;
    const options = new Map<string, number>();
    for (const [optionId, units] of Object.entries(byOption)) {
      if (typeof units === "number" && Number.isFinite(units)) options.set(optionId, units);
    }
    dishes.set(menuItemId, options);
  }
  return dishes;
}

/** A cart line's ask of the kitchen. Options are de-duplicated by id. */
export function demandFromCartLines(lines: readonly PosCartLine[]): StockDemandLine[] {
  return lines.map((line) => ({
    menuItemId: line.menuItemId,
    name: line.name,
    quantity: Number(line.quantity),
    options: uniqueOptions(
      line.selections.map((selection) => ({ id: selection.optionId, name: selection.optionName })),
    ),
  }));
}

function uniqueOptions(options: readonly StockDemandOption[]): StockDemandOption[] {
  const seen = new Map<string, StockDemandOption>();
  for (const option of options) if (!seen.has(option.id)) seen.set(option.id, option);
  return [...seen.values()];
}

/** The parts of an order edit the demand depends on. */
export interface StockEditContextLike {
  mode: "revise" | "append";
  /** The order's lines as placed — already taken off the shelf. */
  originalStockItems: readonly PosStockItem[];
}

/**
 * What THIS sale asks of the shelf.
 *
 * A counter sale asks for its whole cart. An edit asks only for what it ADDS:
 * the ceilings already have the placed order's ingredients taken out, so
 * judging the full order against them would call every re-saved dish short.
 * A revise therefore uses the same difference the tender screen deducts
 * (`posStockRevision(...).deplete`); an append's cart IS the new round.
 */
export function saleStockDemand(
  lines: readonly PosCartLine[],
  editContext: StockEditContextLike | null,
): StockDemandLine[] {
  if (!editContext || editContext.mode === "append") return demandFromCartLines(lines);

  const { deplete } = posStockRevision(editContext.originalStockItems, buildPosStockItems(lines));
  const names = new Map(lines.map((line) => [line.menuItemId, line.name]));
  const optionNames = new Map(
    lines.flatMap((line) => line.selections.map((s) => [s.optionId, s.optionName] as const)),
  );

  return deplete.map((item) => ({
    menuItemId: item.menuItemId,
    name: names.get(item.menuItemId) ?? "An item",
    quantity: item.quantity,
    options: uniqueOptions(
      item.optionIds.map((id) => ({ id, name: optionNames.get(id) ?? "an option" })),
    ),
  }));
}

interface DishTally {
  name: string;
  units: number;
  /** Option id → units of the dish asked for with that option. */
  byOption: Map<string, { name: string; units: number }>;
}

function tallyByDish(demand: readonly StockDemandLine[]): Map<string, DishTally> {
  const tallies = new Map<string, DishTally>();
  for (const line of demand) {
    const quantity = Number(line.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    const tally = tallies.get(line.menuItemId) ?? { name: line.name, units: 0, byOption: new Map() };
    const byOption = new Map(tally.byOption);
    for (const option of line.options) {
      const existing = byOption.get(option.id);
      byOption.set(option.id, { name: existing?.name ?? option.name, units: (existing?.units ?? 0) + quantity });
    }
    tallies.set(line.menuItemId, { name: tally.name, units: tally.units + quantity, byOption });
  }
  return tallies;
}

/**
 * Every dish the sale asks for more of than the estimate, one entry per dish:
 * the binding shelf (the lowest ceiling among the ones exceeded).
 *
 * Lines of the same dish are added up first — two lines of three against a
 * shelf for five is six pizzas — and an option's ceiling is charged only for
 * the lines that picked it.
 */
export function findStockShortfalls(
  demand: readonly StockDemandLine[],
  ceilings: PosStockCeilings,
): StockShortfall[] {
  if (!hasStockCeilings(ceilings)) return [];

  const shortfalls: StockShortfall[] = [];
  for (const [menuItemId, tally] of tallyByDish(demand)) {
    const candidates: StockShortfall[] = [];

    const dishCeiling = ceilings.dishes.get(menuItemId);
    if (dishCeiling !== undefined && tally.units > dishCeiling) {
      candidates.push({ menuItemId, dishName: tally.name, optionName: null, optionId: null, producible: dishCeiling, wanted: tally.units });
    }

    const optionCeilings = ceilings.options.get(menuItemId);
    for (const [optionId, picked] of tally.byOption) {
      const optionCeiling = optionCeilings?.get(optionId);
      if (optionCeiling === undefined || picked.units <= optionCeiling) continue;
      candidates.push({ menuItemId, dishName: tally.name, optionName: picked.name, optionId, producible: optionCeiling, wanted: picked.units });
    }

    if (candidates.length === 0) continue;
    shortfalls.push(candidates.reduce((tightest, next) => (next.producible < tightest.producible ? next : tightest)));
  }
  return shortfalls;
}

function labelOf(shortfall: StockShortfall): string {
  return shortfall.optionName ? `${shortfall.dishName} (${shortfall.optionName})` : shortfall.dishName;
}

function describeShortfall(shortfall: StockShortfall): string {
  const producible = Math.max(0, shortfall.producible);
  return producible === 0
    ? `${labelOf(shortfall)}: stock shows 0`
    : `${labelOf(shortfall)}: stock for ${producible}`;
}

/**
 * The banner above the cart (and the Charge-time question), or `null` when
 * there is nothing worth saying.
 */
export function resolvePosStockWarning(
  demand: readonly StockDemandLine[],
  ceilings: PosStockCeilings,
): string | null {
  const shortfalls = findStockShortfalls(demand, ceilings);
  if (shortfalls.length === 0) return null;

  return `Low stock — ${shortfalls.map(describeShortfall).join(", ")}. Sell it if you have it.`;
}

/**
 * The shortfall of the dish being added, judged with what the sale already
 * holds, or null when the count covers it.
 */
export function findAddedShortfall(
  current: readonly StockDemandLine[],
  added: StockDemandLine,
  ceilings: PosStockCeilings,
): StockShortfall | null {
  return (
    findStockShortfalls([...current, added], ceilings).find(
      (candidate) => candidate.menuItemId === added.menuItemId,
    ) ?? null
  );
}

/**
 * What to ask when ONE more configuration joins the sale, or `null`.
 *
 * Judged with what the sale already holds, but only the dish being added is
 * spoken about — the banner covers the rest.
 */
export function resolveAddStockWarning(
  current: readonly StockDemandLine[],
  added: StockDemandLine,
  ceilings: PosStockCeilings,
): string | null {
  const shortfall = findAddedShortfall(current, added, ceilings);
  if (!shortfall) return null;

  const producible = Math.max(0, shortfall.producible);
  const shelf = producible === 0 ? "Stock shows 0" : `Stock shows only ${producible}`;
  return `${shelf} for ${labelOf(shortfall)} — this sale would make it ${shortfall.wanted}. Sell it if you have it on the shelf.`;
}
