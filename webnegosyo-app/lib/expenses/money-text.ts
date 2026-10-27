/**
 * Money text for the Expenses and Profit screens — one rule everywhere
 * (design plan, "Money reads calmly"):
 *
 * - Lists, rows, detail: `formatCents(c, { compact: true })` — whole pesos,
 *   centavos only when there are some ("₱1,050", "₱1,050.50").
 * - Big hero figures: `pesoParts` so the ₱ can be drawn smaller than the digits.
 * - Tight bars and chips: `formatPesoShort` ("₱124.6k").
 *
 * Money out is never written with a minus on an expense-only screen; the sign
 * belongs to Profit, where a loss is real news.
 */
import { formatCents } from "./expense-format";

const MINUS = "−";
const THOUSAND = 1_000;
const MILLION = 1_000_000;
/** Below this many pesos the short form is the full figure. */
const SHORT_FROM_PESOS = 10_000;

export interface PesoParts {
  /** "−" or "". */
  readonly sign: string;
  readonly symbol: "₱";
  /** "48,230" / "1,050.50". */
  readonly body: string;
}

/** Splits an amount for a hero figure: sign, a small ₱, then the digits. */
export function pesoParts(cents: number): PesoParts {
  const safe = Number.isFinite(cents) ? Math.round(cents) : 0;
  const text = formatCents(Math.abs(safe), { compact: true });
  return { sign: safe < 0 ? MINUS : "", symbol: "₱", body: text.replace(/^₱/, "") };
}

function trimmed(value: number): string {
  const fixed = value.toFixed(1);
  return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
}

/** "₱9,840", "₱124.6k", "₱1.2M", "−₱3.4k" — whole pesos, short above ₱10,000. */
export function formatPesoShort(cents: number): string {
  const safe = Number.isFinite(cents) ? Math.round(cents) : 0;
  const pesos = Math.abs(safe) / 100;
  const sign = safe < 0 && Math.round(pesos) !== 0 ? MINUS : "";
  if (pesos < SHORT_FROM_PESOS) return `${sign}₱${Math.round(pesos).toLocaleString("en-PH")}`;
  if (pesos < MILLION) return `${sign}₱${trimmed(pesos / THOUSAND)}k`;
  return `${sign}₱${trimmed(pesos / MILLION)}M`;
}

export interface Change {
  readonly direction: "up" | "down" | "same";
  /** Whole percent, always ≥ 0. */
  readonly percent: number;
}

/**
 * How `current` compares with `previous`, in whole percent. Null when there is
 * nothing to compare with (no previous spending), so the screen says nothing
 * rather than "▲ ∞%".
 */
export function percentChange(current: number, previous: number): Change | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  const percent = Math.round((Math.abs(current - previous) / previous) * 100);
  if (percent === 0) return { direction: "same", percent: 0 };
  return { direction: current > previous ? "up" : "down", percent };
}
