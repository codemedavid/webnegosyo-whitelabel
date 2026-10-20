/**
 * The feed as the list draws it: Manila days, each opened by a one-line
 * verdict, with a day's routine events folded into one expandable row per
 * family (design spec P1 summary-before-detail, P3 flag exceptions not noise).
 *
 * Pure: the screen hands it the loaded events (newest first, as the RPC
 * returns them) and the set of roll-ups the merchant opened.
 */

import { formatManilaDay, formatPeso, formatQuantity, formatSignedPeso, manilaDayKey } from "./format";
import type { StoreActivityEvent } from "./store-event";
import type { ActivityKind } from "./taxonomy";

export type RoutineFamily = "orders" | "payments" | "stock" | "loyalty";

const FAMILY_OF_KIND: Partial<Readonly<Record<ActivityKind, RoutineFamily>>> = {
  "order.placed": "orders",
  "order.status_changed": "orders",
  "order.completed": "orders",
  "payment.charged": "payments",
  "stock.sale": "stock",
  "stock.restored": "stock",
  "loyalty.stamps_earned": "loyalty",
  "loyalty.reward_issued": "loyalty",
};

/** How many named items a stock roll-up lists before "N more". */
const ROLLUP_NAMED_ITEMS = 3;

export interface DayHeaderItem {
  type: "day";
  key: string;
  label: string;
  summary: string;
  isAllClear: boolean;
}

export interface EventItem {
  type: "event";
  key: string;
  event: StoreActivityEvent;
}

export interface RollupItem {
  type: "rollup";
  key: string;
  family: RoutineFamily;
  count: number;
  title: string;
  lines: string[];
  /** Newest first, as loaded; the row shows a bounded slice when expanded. */
  events: StoreActivityEvent[];
  isExpanded: boolean;
}

export type FeedItem = DayHeaderItem | EventItem | RollupItem;

export interface BuildFeedOptions {
  nowIso: string;
  expanded: ReadonlySet<string>;
}

export function routineFamilyOf(kind: ActivityKind): RoutineFamily | null {
  return FAMILY_OF_KIND[kind] ?? null;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function sumAmounts(events: readonly StoreActivityEvent[]): number {
  return events.reduce((total, event) => total + (event.amount ?? 0), 0);
}

function hasOpenFlag(event: StoreActivityEvent): boolean {
  return event.flags.length > 0 && event.reviewedAt === null;
}

/** "₱185 refunded · 1 cancel · drawer −₱100", or "Nothing to check". */
export function daySummary(events: readonly StoreActivityEvent[]): { summary: string; isAllClear: boolean } {
  const refunded = Math.abs(sumAmounts(events.filter((event) => event.kind === "refund.issued")));
  const cancels = events.filter((event) => event.kind === "order.cancelled").length;
  const drawer = sumAmounts(events.filter((event) => event.kind === "shift.closed"));
  const toCheck = events.filter(hasOpenFlag).length;
  const parts = [
    refunded > 0 ? `${formatPeso(refunded)} refunded` : null,
    cancels > 0 ? plural(cancels, "cancel", "cancels") : null,
    Math.round(drawer * 100) !== 0 ? `drawer ${formatSignedPeso(drawer)}` : null,
    toCheck > 0 ? `${toCheck} to check` : null,
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? { summary: "Nothing to check", isAllClear: true } : { summary: parts.join(" · "), isAllClear: false };
}

interface StockLine {
  name: string;
  quantity: number;
  unit: string;
}

/**
 * The ingredient lines one stock row stands for. A sale is ONE row per order
 * with its top lines in `summary.lines` ({name, quantity}); older or manual
 * rows carry a single item in `summary.itemName` + quantity/unit.
 */
function stockLinesOf(event: StoreActivityEvent): StockLine[] {
  const lines = event.summary.lines;
  if (Array.isArray(lines)) {
    return lines.flatMap((line: unknown): StockLine[] => {
      const entry = (line ?? {}) as Record<string, unknown>;
      const name = typeof entry.name === "string" && entry.name.trim() !== "" ? entry.name.trim() : "Item";
      const quantity = typeof entry.quantity === "number" && Number.isFinite(entry.quantity) ? Math.abs(entry.quantity) : 0;
      return [{ name, quantity, unit: "" }];
    });
  }
  const name = event.summary.itemName;
  return [{
    name: typeof name === "string" && name.trim() !== "" ? name.trim() : "Stock",
    quantity: Math.abs(event.quantity ?? 0),
    unit: event.unit ?? "",
  }];
}

function stockLines(events: readonly StoreActivityEvent[]): string[] {
  const totals = new Map<string, StockLine>();
  for (const line of events.flatMap(stockLinesOf)) {
    const key = `${line.name}|${line.unit}`;
    const previous = totals.get(key);
    totals.set(key, { ...line, quantity: (previous?.quantity ?? 0) + line.quantity });
  }
  const entries = [...totals.values()];
  const named = entries
    .slice(0, ROLLUP_NAMED_ITEMS)
    .map((line) => [line.name, formatQuantity(line.quantity), line.unit].filter((part) => part !== "").join(" "));
  const more = entries.length - ROLLUP_NAMED_ITEMS;
  return [[...named, ...(more > 0 ? [`${more} more`] : [])].join(" · ")];
}

function distinctOrders(events: readonly StoreActivityEvent[]): number {
  return new Set(events.map((event) => event.subjectRef ?? event.orderNumber ?? event.id)).size;
}

function familyText(family: RoutineFamily, events: readonly StoreActivityEvent[]): { title: string; lines: string[] } {
  const count = events.length;
  switch (family) {
    case "stock":
      return { title: `Stock used by ${plural(distinctOrders(events), "order", "orders")}`, lines: stockLines(events) };
    case "payments":
      return { title: plural(count, "payment taken", "payments taken"), lines: [`${formatPeso(sumAmounts(events))} in`] };
    case "loyalty": {
      const earned = events.filter((event) => event.kind === "loyalty.stamps_earned").length;
      const unlocked = count - earned;
      const parts = [earned > 0 ? plural(earned, "stamp earned", "stamps earned") : null, unlocked > 0 ? plural(unlocked, "reward unlocked", "rewards unlocked") : null];
      return { title: plural(count, "loyalty update", "loyalty updates"), lines: [parts.filter(Boolean).join(" · ")] };
    }
    default: {
      const placed = events.filter((event) => event.kind === "order.placed").length;
      const completed = events.filter((event) => event.kind === "order.completed").length;
      const parts = [placed > 0 ? `${placed} placed` : null, completed > 0 ? `${completed} completed` : null];
      return { title: `${plural(distinctOrders(events), "order", "orders")} placed or moved`, lines: [parts.filter(Boolean).join(" · ")].filter((line) => line !== "") };
    }
  }
}

function dayItems(dayKey: string, events: readonly StoreActivityEvent[], options: BuildFeedOptions): FeedItem[] {
  const families = new Map<RoutineFamily, StoreActivityEvent[]>();
  for (const event of events) {
    const family = event.isRoutine ? routineFamilyOf(event.kind) : null;
    if (family) families.set(family, [...(families.get(family) ?? []), event]);
  }
  const placed = new Set<RoutineFamily>();
  const rows = events.flatMap((event): FeedItem[] => {
    const family = event.isRoutine ? routineFamilyOf(event.kind) : null;
    if (!family) return [{ type: "event", key: event.id, event }];
    if (placed.has(family)) return [];
    placed.add(family);
    const members = families.get(family) ?? [];
    const key = `rollup:${dayKey}:${family}`;
    return [{ type: "rollup", key, family, count: members.length, events: members, isExpanded: options.expanded.has(key), ...familyText(family, members) }];
  });
  const { summary, isAllClear } = daySummary(events.filter((event) => !event.isRoutine));
  const header: DayHeaderItem = {
    type: "day",
    key: `day:${dayKey}`,
    label: formatManilaDay(events[0].occurredAt, options.nowIso),
    summary,
    isAllClear,
  };
  return [header, ...rows];
}

export function buildFeedItems(events: readonly StoreActivityEvent[], options: BuildFeedOptions): FeedItem[] {
  const days = new Map<string, StoreActivityEvent[]>();
  for (const event of events) {
    const key = manilaDayKey(event.occurredAt);
    days.set(key, [...(days.get(key) ?? []), event]);
  }
  return [...days.entries()].flatMap(([dayKey, dayEvents]) => dayItems(dayKey, dayEvents, options));
}
