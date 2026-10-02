/**
 * One ingredient's ledger (`stock_movements`) as a timeline the merchant can
 * read on the phone.
 *
 * Labels mirror the web's MOVEMENT_REASON_LABELS
 * (src/lib/inventory/stock-ledger.ts) — the two surfaces describe the same row
 * and must not invent different words for it.
 *
 * Pure — no React, no Supabase. Read: lib/ingredient-service.ts.
 */

import { formatStockQuantity } from "./inventory-stock";

/** The `stock_movements` columns the timeline reads. */
export interface MovementRow {
  id: string;
  reason: string;
  quantity_delta: number;
  balance_after: number;
  note: string | null;
  order_id: string | null;
  created_at: string;
  /** NULL = the unbranched store pool. Optional for rows read without it. */
  outlet_id?: string | null;
}

/**
 * How a row reads at a glance. `in`/`out` are ordinary flow, `loss` is stock
 * thrown away, `adjust` is a count correcting the books in either direction.
 */
export type HistoryTone = "in" | "out" | "loss" | "adjust";

export interface HistoryEntry {
  id: string;
  label: string;
  tone: HistoryTone;
  /** Signed, with a true minus sign: "+5 kg", "−0.25 kg", "0 kg". */
  delta: string;
  /** The running total after this row. */
  balance: string;
  note: string | null;
  fromOrder: boolean;
  createdAt: string;
}

export interface HistoryGroup {
  title: string;
  entries: HistoryEntry[];
}

const REASON_LABELS: Record<string, string> = {
  receive: "Received",
  stocktake: "Counted",
  waste: "Wasted",
  sale: "Sold",
  void: "Order voided",
  transfer_out: "Sent to branch",
  transfer_in: "Received from branch",
};

const MINUS = "−";
const QUANTITY_EPSILON = 1e-4;
const MS_PER_DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "mystery_adjustment" → "Mystery adjustment": unknown rows stay readable. */
function humanize(reason: string): string {
  const words = reason.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function toneOf(reason: string, delta: number): HistoryTone {
  if (reason === "stocktake") return "adjust";
  if (reason === "waste") return "loss";
  return delta >= 0 ? "in" : "out";
}

function signedQuantity(delta: number, unit: string): string {
  if (Math.abs(delta) <= QUANTITY_EPSILON) return formatStockQuantity(0, unit);
  const magnitude = formatStockQuantity(Math.abs(delta), unit);
  return delta > 0 ? `+${magnitude}` : `${MINUS}${magnitude}`;
}

/** Newest first is the caller's order; this keeps it. */
export function buildHistoryEntries(rows: readonly MovementRow[], unit: string): HistoryEntry[] {
  return rows.map((row) => {
    const delta = Number(row.quantity_delta);
    const note = row.note?.trim();
    return {
      id: row.id,
      label: REASON_LABELS[row.reason] ?? humanize(row.reason),
      tone: toneOf(row.reason, delta),
      delta: signedQuantity(delta, unit),
      balance: formatStockQuantity(Number(row.balance_after), unit),
      note: note ? note : null,
      fromOrder: Boolean(row.order_id),
      createdAt: row.created_at,
    };
  });
}

export interface DayContext {
  now: Date;
  /** The store's offset from UTC; Manila is +480. */
  utcOffsetMinutes: number;
}

/** Days since the epoch in the store's local time. */
function localDay(iso: string | Date, offsetMinutes: number): number {
  const ms = (typeof iso === "string" ? Date.parse(iso) : iso.getTime()) + offsetMinutes * 60_000;
  return Math.floor(ms / MS_PER_DAY);
}

function dayTitle(day: number, today: number): string {
  if (day === today) return "Today";
  if (day === today - 1) return "Yesterday";
  const date = new Date(day * MS_PER_DAY);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

/** Consecutive entries on one local day share a heading. */
export function groupHistoryByDay(
  entries: readonly HistoryEntry[],
  context: DayContext,
): HistoryGroup[] {
  const today = localDay(context.now, context.utcOffsetMinutes);
  const groups: HistoryGroup[] = [];
  let currentDay: number | null = null;

  for (const entry of entries) {
    const day = localDay(entry.createdAt, context.utcOffsetMinutes);
    if (day !== currentDay) {
      groups.push({ title: dayTitle(day, today), entries: [] });
      currentDay = day;
    }
    groups[groups.length - 1].entries.push(entry);
  }
  return groups;
}

/** When stock last came IN — from a supplier or another branch. */
export function lastReceivedAt(rows: readonly MovementRow[]): string | null {
  let latest: string | null = null;
  for (const row of rows) {
    if (row.reason !== "receive" && row.reason !== "transfer_in") continue;
    if (latest === null || Date.parse(row.created_at) > Date.parse(latest)) latest = row.created_at;
  }
  return latest;
}

/**
 * Whether `balance_after` means anything on this screen.
 *
 * It is each BRANCH's running total. On one branch's shelf, or a store with no
 * branches, it reads as the shelf over time. Store-wide over several branches
 * it would jump between shelves row to row, so it is better left out.
 */
export function canShowRunningBalance(
  rows: readonly MovementRow[],
  outletId: string | null | undefined,
): boolean {
  if (outletId !== undefined) return true;
  return rows.every((row) => !row.outlet_id);
}

/** Within this many days a date reads as "N days ago"; beyond it, as a date. */
const RELATIVE_DAY_LIMIT = 6;

/** "Today", "Yesterday", "4 days ago", "Sep 1", or "Never". */
export function describeSince(iso: string | null, context: DayContext): string {
  if (!iso) return "Never";
  const today = localDay(context.now, context.utcOffsetMinutes);
  const day = localDay(iso, context.utcOffsetMinutes);
  const ago = today - day;
  if (ago <= 0) return "Today";
  if (ago === 1) return "Yesterday";
  if (ago <= RELATIVE_DAY_LIMIT) return `${ago} days ago`;
  return dayTitle(day, today);
}

/** "1:07 PM" on the store's clock, whatever the phone's timezone. */
export function formatEntryTime(iso: string, utcOffsetMinutes: number): string {
  const local = new Date(Date.parse(iso) + utcOffsetMinutes * 60_000);
  const hours = local.getUTCHours();
  const minutes = local.getUTCMinutes().toString().padStart(2, "0");
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${minutes} ${hours < 12 ? "AM" : "PM"}`;
}

/** The store's offset. Every WebNegosyo store trades on Manila time. */
export const STORE_UTC_OFFSET_MINUTES = 480;
