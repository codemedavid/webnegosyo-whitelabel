/**
 * Per-product, per-variation and per-add-on performance for a window.
 *
 * Money rules — the same as every other product figure in the app:
 * - A product's sales are the sum of its lines' `subtotal`: what the line took,
 *   variation and add-ons included, before order-level discounts, service
 *   charge and delivery fees (those belong to the order, not to a dish).
 * - A variation is credited with the whole of the lines that carried it; it
 *   is a way of slicing the product's sales, so a group's options add up to
 *   the product's sales minus its unchosen lines.
 * - An add-on's revenue is its own price × how many were sold. Exact when the
 *   line recorded the price; an estimate from today's menu otherwise, flagged.
 */

import { DAY_MS, localDateKey } from "../backends/analytics-time";
import { normalizeName, parseLineModifiers } from "./modifiers";
import type { CatalogProduct, LineModifier, SalesLine } from "./types";

export interface PerformanceWindow {
  startMs: number;
  /** Exclusive. */
  endMs: number;
}

export interface OptionStat {
  name: string;
  units: number;
  sales: number;
  orders: number;
  /** Of the product's units in the window. */
  share: number;
}

export interface VariationGroupStat {
  groupName: string;
  /** Most-picked first. */
  options: OptionStat[];
  /** Product units sold with nothing chosen in this group. */
  unchosenUnits: number;
}

export interface AddonStat {
  name: string;
  groupName: string;
  /** Add-ons sold — a line of 2 burgers with double cheese is 4. */
  units: number;
  /** Product units that carried it at least once. */
  attachedUnits: number;
  /** attachedUnits ÷ the product's units. */
  attachRate: number;
  /** null when no price is known for any of them. */
  revenue: number | null;
  revenueIsEstimate: boolean;
}

export interface DailyPoint {
  dateKey: string;
  sales: number;
  units: number;
}

export interface ProductPerformance {
  menuItemId: string;
  name: string;
  imageUrl: string | null;
  units: number;
  sales: number;
  orders: number;
  avgPrice: number;
  /** null when no comparison window was asked for. */
  previousSales: number | null;
  /** Fraction (0.12 = up 12%); null with nothing to compare against. */
  salesChange: number | null;
  addonRevenue: number;
  addonRevenueIsEstimate: boolean;
  daily: DailyPoint[];
  variationGroups: VariationGroupStat[];
  addons: AddonStat[];
}

export interface ProductSummary {
  menuItemId: string;
  name: string;
  imageUrl: string | null;
  units: number;
  sales: number;
  orders: number;
  /** Of the store's sales in the window. */
  share: number;
  salesChange: number | null;
  daily: number[];
  topVariation: { groupName: string; name: string; share: number } | null;
  addonRevenue: number;
}

export interface StoreAddonStat {
  name: string;
  units: number;
  orders: number;
  /** orders ÷ the store's orders in the window. */
  orderShare: number;
  revenue: number | null;
  revenueIsEstimate: boolean;
  /** The products it was added to, busiest first. */
  productNames: string[];
}

export interface StorePerformance {
  isEmpty: boolean;
  dayKeys: string[];
  totals: {
    sales: number;
    units: number;
    orders: number;
    addonUnits: number;
    addonRevenue: number;
    addonRevenueIsEstimate: boolean;
  };
  previousSales: number | null;
  salesChange: number | null;
  products: ProductSummary[];
  addons: StoreAddonStat[];
}

interface BuildInput {
  lines: readonly SalesLine[];
  catalog: ReadonlyMap<string, CatalogProduct>;
  window: PerformanceWindow;
  previous: PerformanceWindow | null;
}

// --- shared helpers -------------------------------------------------------------

function within(line: SalesLine, window: PerformanceWindow): boolean {
  return line.createdAtMs >= window.startMs && line.createdAtMs < window.endMs;
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function change(current: number, previous: number | null): number | null {
  if (previous === null || previous <= 0) return null;
  return (current - previous) / previous;
}

function sumSales(lines: readonly SalesLine[]): number {
  return lines.reduce((sum, line) => sum + line.subtotal, 0);
}

function distinctOrders(lines: readonly SalesLine[]): number {
  return new Set(lines.map((line) => line.orderId)).size;
}

/** Every Manila day the window covers, oldest first. */
export function windowDayKeys(window: PerformanceWindow): string[] {
  const keys: string[] = [];
  for (let at = window.startMs; at < window.endMs; at += DAY_MS) {
    keys.push(localDateKey(at));
  }
  return keys;
}

function dailySeries(lines: readonly SalesLine[], dayKeys: readonly string[]): DailyPoint[] {
  const byDay = new Map(dayKeys.map((dateKey) => [dateKey, { dateKey, sales: 0, units: 0 }]));
  for (const line of lines) {
    const point = byDay.get(localDateKey(line.createdAtMs));
    if (!point) continue;
    byDay.set(point.dateKey, {
      ...point,
      sales: point.sales + line.subtotal,
      units: point.units + line.quantity,
    });
  }
  return dayKeys.map((dateKey) => byDay.get(dateKey) as DailyPoint);
}

interface ParsedLine {
  line: SalesLine;
  modifiers: LineModifier[];
}

function parseAll(lines: readonly SalesLine[], catalog: ReadonlyMap<string, CatalogProduct>): ParsedLine[] {
  return lines.map((line) => ({ line, modifiers: parseLineModifiers(line, catalog.get(line.menuItemId)) }));
}

/** An add-on's running tally while lines are walked. */
interface AddonTally {
  /** As first seen; the map key is the normalized form. */
  name: string;
  groupName: string;
  units: number;
  attachedUnits: number;
  orders: Set<string>;
  revenue: number;
  pricedUnits: number;
  hasEstimate: boolean;
  hasUnpriced: boolean;
  /** Units per product name, for the store view. */
  products: Map<string, number>;
}

/** Walk every add-on on every line once, keyed by add-on name. */
function tallyAddons(
  parsed: readonly ParsedLine[],
  nameOfProduct: (line: SalesLine) => string
): Map<string, AddonTally> {
  const tallies = new Map<string, AddonTally>();

  for (const { line, modifiers } of parsed) {
    const attachedHere = new Set<string>();
    for (const modifier of modifiers) {
      if (modifier.kind !== "addon") continue;
      const units = line.quantity * modifier.perUnit;
      const key = normalizeName(modifier.name);
      const tally = tallies.get(key) ?? {
        name: modifier.name,
        groupName: modifier.groupName,
        units: 0,
        attachedUnits: 0,
        orders: new Set<string>(),
        revenue: 0,
        pricedUnits: 0,
        hasEstimate: false,
        hasUnpriced: false,
        products: new Map<string, number>(),
      };
      tallies.set(key, tally);

      tally.units += units;
      if (!attachedHere.has(key)) tally.attachedUnits += line.quantity;
      attachedHere.add(key);
      tally.orders.add(line.orderId);
      if (modifier.unitPrice === null) {
        tally.hasUnpriced = true;
      } else {
        tally.revenue += modifier.unitPrice * units;
        tally.pricedUnits += units;
        tally.hasEstimate = tally.hasEstimate || modifier.priceSource === "menu";
      }
      const product = nameOfProduct(line);
      tally.products.set(product, (tally.products.get(product) ?? 0) + units);
    }
  }

  return tallies;
}

function tallyRevenue(tally: AddonTally): Pick<AddonStat, "revenue" | "revenueIsEstimate"> {
  return {
    revenue: tally.pricedUnits > 0 ? tally.revenue : null,
    // Part-priced is still an estimate of the whole.
    revenueIsEstimate: tally.hasEstimate || (tally.hasUnpriced && tally.pricedUnits > 0),
  };
}

function byRevenueThenUnits(
  a: { revenue: number | null; units: number },
  b: { revenue: number | null; units: number }
): number {
  return (b.revenue ?? 0) - (a.revenue ?? 0) || b.units - a.units;
}

// --- one product ----------------------------------------------------------------

function variationGroupsOf(parsed: readonly ParsedLine[], productUnits: number): VariationGroupStat[] {
  // Local accumulators, mutated in one pass: copying a Set per line made a
  // busy store's month quadratic. Nothing here escapes the function.
  const groups = new Map<string, Map<string, { name: string; units: number; sales: number; orders: Set<string> }>>();
  const groupUnits = new Map<string, number>();

  for (const { line, modifiers } of parsed) {
    const seenGroups = new Set<string>();
    for (const modifier of modifiers) {
      if (modifier.kind !== "variation") continue;
      const options = groups.get(modifier.groupName) ?? new Map();
      groups.set(modifier.groupName, options);
      const optionKey = normalizeName(modifier.name);
      const stat = options.get(optionKey) ?? { name: modifier.name, units: 0, sales: 0, orders: new Set<string>() };
      options.set(optionKey, stat);
      stat.units += line.quantity;
      stat.sales += line.subtotal;
      stat.orders.add(line.orderId);
      // A line counts once toward its group, however many options it lists there.
      if (!seenGroups.has(modifier.groupName)) {
        seenGroups.add(modifier.groupName);
        groupUnits.set(modifier.groupName, (groupUnits.get(modifier.groupName) ?? 0) + line.quantity);
      }
    }
  }

  return Array.from(groups.entries())
    .map(([groupName, options]) => ({
      groupName,
      options: Array.from(options.values())
        .map((stat) => ({
          name: stat.name,
          units: stat.units,
          sales: stat.sales,
          orders: stat.orders.size,
          share: ratio(stat.units, productUnits),
        }))
        .sort((a, b) => b.units - a.units || b.sales - a.sales),
      unchosenUnits: Math.max(0, productUnits - (groupUnits.get(groupName) ?? 0)),
    }))
    // The group most lines chose from first — usually the product's "Size".
    .sort((a, b) => a.unchosenUnits - b.unchosenUnits);
}

function addonsOf(parsed: readonly ParsedLine[], productUnits: number): AddonStat[] {
  return Array.from(tallyAddons(parsed, (line) => line.menuItemId).values())
    .map((tally) => ({
      name: tally.name,
      groupName: tally.groupName,
      units: tally.units,
      attachedUnits: tally.attachedUnits,
      attachRate: ratio(tally.attachedUnits, productUnits),
      ...tallyRevenue(tally),
    }))
    .sort(byRevenueThenUnits);
}

function addonTotals(addons: readonly AddonStat[]): { revenue: number; isEstimate: boolean } {
  return {
    revenue: addons.reduce((sum, addon) => sum + (addon.revenue ?? 0), 0),
    isEstimate: addons.some((addon) => addon.revenueIsEstimate),
  };
}

function productName(menuItemId: string, lines: readonly SalesLine[], catalog: ReadonlyMap<string, CatalogProduct>): string {
  return catalog.get(menuItemId)?.name ?? lines[0]?.menuItemName ?? "Removed item";
}

export function buildProductPerformance(input: BuildInput & { menuItemId: string }): ProductPerformance {
  const { lines, catalog, window, previous, menuItemId } = input;
  const own = lines.filter((line) => line.menuItemId === menuItemId);
  const current = own.filter((line) => within(line, window));
  const parsed = parseAll(current, catalog);

  const units = current.reduce((sum, line) => sum + line.quantity, 0);
  const sales = sumSales(current);
  const previousSales = previous ? sumSales(own.filter((line) => within(line, previous))) : null;
  const addons = addonsOf(parsed, units);
  const addonMoney = addonTotals(addons);

  return {
    menuItemId,
    name: productName(menuItemId, own, catalog),
    imageUrl: catalog.get(menuItemId)?.imageUrl ?? null,
    units,
    sales,
    orders: distinctOrders(current),
    avgPrice: ratio(sales, units),
    previousSales,
    salesChange: change(sales, previousSales),
    addonRevenue: addonMoney.revenue,
    addonRevenueIsEstimate: addonMoney.isEstimate,
    daily: dailySeries(current, windowDayKeys(window)),
    variationGroups: variationGroupsOf(parsed, units),
    addons,
  };
}

// --- the whole store ------------------------------------------------------------

function storeAddons(
  parsed: readonly ParsedLine[],
  storeOrders: number,
  catalog: ReadonlyMap<string, CatalogProduct>
): StoreAddonStat[] {
  const nameOfProduct = (line: SalesLine) => productName(line.menuItemId, [line], catalog);
  return Array.from(tallyAddons(parsed, nameOfProduct).values())
    .map((tally) => ({
      name: tally.name,
      units: tally.units,
      orders: tally.orders.size,
      orderShare: ratio(tally.orders.size, storeOrders),
      ...tallyRevenue(tally),
      productNames: Array.from(tally.products.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([product]) => product),
    }))
    .sort(byRevenueThenUnits);
}

/** Lines grouped by product, one pass. */
function groupByProduct(lines: readonly SalesLine[]): Map<string, SalesLine[]> {
  const groups = new Map<string, SalesLine[]>();
  for (const line of lines) {
    const group = groups.get(line.menuItemId);
    if (group) group.push(line);
    else groups.set(line.menuItemId, [line]);
  }
  return groups;
}

export function buildStorePerformance(input: BuildInput): StorePerformance {
  const { lines, catalog, window, previous } = input;
  const current = lines.filter((line) => within(line, window));
  const previousLines = previous ? lines.filter((line) => within(line, previous)) : [];
  const parsed = parseAll(current, catalog);
  const dayKeys = windowDayKeys(window);

  const sales = sumSales(current);
  const orders = distinctOrders(current);
  const previousSales = previous ? sumSales(previousLines) : null;

  const previousByProduct = groupByProduct(previousLines);
  const products: ProductSummary[] = Array.from(groupByProduct(current).entries())
    .map(([menuItemId, own]) => {
      const detail = buildProductPerformance({
        lines: [...own, ...(previousByProduct.get(menuItemId) ?? [])],
        catalog,
        window,
        previous,
        menuItemId,
      });
      const top = detail.variationGroups[0]?.options[0];
      return {
        menuItemId,
        name: detail.name,
        imageUrl: detail.imageUrl,
        units: detail.units,
        sales: detail.sales,
        orders: detail.orders,
        share: ratio(detail.sales, sales),
        salesChange: detail.salesChange,
        daily: detail.daily.map((point) => point.sales),
        topVariation: top
          ? { groupName: detail.variationGroups[0].groupName, name: top.name, share: top.share }
          : null,
        addonRevenue: detail.addonRevenue,
      };
    })
    .sort((a, b) => b.sales - a.sales || b.units - a.units);

  const addons = storeAddons(parsed, orders, catalog);
  const addonMoney = {
    revenue: addons.reduce((sum, addon) => sum + (addon.revenue ?? 0), 0),
    isEstimate: addons.some((addon) => addon.revenueIsEstimate),
  };

  return {
    isEmpty: current.length === 0,
    dayKeys,
    totals: {
      sales,
      units: current.reduce((sum, line) => sum + line.quantity, 0),
      orders,
      addonUnits: addons.reduce((sum, addon) => sum + addon.units, 0),
      addonRevenue: addonMoney.revenue,
      addonRevenueIsEstimate: addonMoney.isEstimate,
    },
    previousSales,
    salesChange: change(sales, previousSales),
    products,
    addons,
  };
}
