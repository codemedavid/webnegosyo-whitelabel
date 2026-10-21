/**
 * How the app writes expense money, dates and sources (plan §5.6).
 *
 * App-only presentation helpers: the shared engine (`types.ts`,
 * `categories.ts`, `keypad.ts`…) is a byte-identical copy of the web's and is
 * never edited here. Money is integer centavos; dates are Asia/Manila business
 * dates (`YYYY-MM-DD`). The Philippines has no daylight saving, so Manila is
 * always UTC+8 and a fixed offset is exact.
 */

import { formatPeso } from "./keypad";
import type { PaidFrom } from "./types";

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Manila business date of an instant. */
export function manilaDate(ms: number): string {
  return new Date(ms + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Today in Manila. */
export function manilaToday(now: number = Date.now()): string {
  return manilaDate(now);
}

/** `YYYY-MM` of a Manila date or instant. */
export function monthOf(dateOrMs: string | number): string {
  const date = typeof dateOrMs === "number" ? manilaDate(dateOrMs) : dateOrMs;
  return date.slice(0, 7);
}

/** First and last day of a `YYYY-MM` month, both inclusive. */
export function monthBounds(month: string): { from: string; to: string } {
  const [year, mon] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}

/** The month before or after (`delta` months). */
export function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return shifted.toISOString().slice(0, 7);
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "October" for this year's months, "October 2025" for older ones. */
export function monthLabel(month: string, now: number = Date.now()): string {
  const [year, mon] = month.split("-").map(Number);
  const name = MONTH_NAMES[mon - 1] ?? month;
  return String(year) === manilaToday(now).slice(0, 4) ? name : `${name} ${year}`;
}

/**
 * Peso text for centavos. Lists drop ".00" (`compact`); detail screens and
 * anything a person checks against paper keep the centavos. One formatter
 * with the web (`keypad.ts`).
 */
export function formatCents(cents: number, options: { compact?: boolean } = {}): string {
  return formatPeso(cents, { decimals: options.compact ? "auto" : "always" });
}

/** What a screen reader says for an amount: "1,250 pesos and 50 centavos". */
export function spokenCents(cents: number): string {
  const safe = Math.max(0, Math.round(Number.isFinite(cents) ? cents : 0));
  const pesos = Math.floor(safe / 100).toLocaleString("en-PH");
  const centavos = safe % 100;
  const pesoWord = safe >= 100 && safe < 200 ? "peso" : "pesos";
  return centavos === 0 ? `${pesos} ${pesoWord}` : `${pesos} ${pesoWord} and ${centavos} centavos`;
}

export const PAID_FROM_LABELS: Record<PaidFrom, string> = {
  drawer: "Drawer",
  cash: "Cash on hand",
  gcash: "GCash",
  maya: "Maya",
  bank: "Bank",
  card: "Card",
  owner: "Owner's pocket",
};

/** The sources a person picks outside the drawer, in the order the pill offers them. */
export const PICKABLE_PAID_FROM: readonly Exclude<PaidFrom, "drawer">[] = [
  "cash",
  "gcash",
  "maya",
  "bank",
  "card",
  "owner",
];

/** "9:42 AM" in Manila. */
export function manilaClock(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const shifted = new Date(ms + MANILA_OFFSET_MS);
  const hours = shifted.getUTCHours();
  const minutes = String(shifted.getUTCMinutes()).padStart(2, "0");
  const suffix = hours < 12 ? "AM" : "PM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${minutes} ${suffix}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Today", "Yesterday" or "Mon, Oct 19" for a Manila date. */
export function dayLabel(date: string, now: number = Date.now()): string {
  const today = manilaToday(now);
  if (date === today) return "Today";
  if (date === manilaDate(now - 24 * 60 * 60 * 1000)) return "Yesterday";
  const [year, mon, day] = date.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, mon - 1, day)).getUTCDay()];
  return `${weekday}, ${SHORT_MONTHS[mon - 1]} ${day}`;
}
