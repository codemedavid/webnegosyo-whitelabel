/**
 * Recounts and closed days, worded for the cashier (CONTRACTS W3.2).
 *
 * - A drawer may be recounted once; both counts are kept. When the second
 *   differs from the first, the result and the slip say so plainly
 *   ("Counted twice: ₱0 → ₱8,345") so the owner sees it was recounted, not
 *   hidden.
 * - Once a business day is closed, nobody starts a shift on it: the server
 *   refuses (`day_closed`, 20261027170000) and the Drawer says what to do.
 * Pure.
 */

import { formatPeso } from "../expenses/keypad";

/** One `shift_counts` row, as the slip reads it. */
export interface CountAttempt {
  attempt: number;
  countedCents: number;
}

export interface Recount {
  firstCents: number;
  finalCents: number;
}

/** The first and the last count, when there was a second that changed the figure. */
export function recountOf(attempts: readonly CountAttempt[]): Recount | null {
  const first = attempts.find((a) => a.attempt === 1);
  const second = attempts.find((a) => a.attempt === 2);
  if (!first || !second || first.countedCents === second.countedCents) return null;
  return { firstCents: first.countedCents, finalCents: second.countedCents };
}

export function recountLine(recount: Recount | null): string | null {
  return recount ? `Counted twice: ${formatPeso(recount.firstCents)} → ${formatPeso(recount.finalCents)}` : null;
}

/** `shift_counts` rows (snake_case from PostgREST) → attempts; anything unreadable is skipped. */
export function parseCountAttempts(rows: unknown): CountAttempt[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row): CountAttempt[] => {
    if (!row || typeof row !== "object") return [];
    const r = row as Record<string, unknown>;
    const attempt = Number(r.attempt);
    const counted = typeof r.counted_cents === "string" ? Number(r.counted_cents) : r.counted_cents;
    if (!Number.isInteger(attempt) || typeof counted !== "number" || !Number.isSafeInteger(counted)) return [];
    return [{ attempt, countedCents: counted }];
  });
}

/** Does an error from opening a shift say the business day is already closed? */
export function isDayClosedRefusal(message: string | null | undefined): boolean {
  return /day_closed|business day is closed|day is already closed/i.test(message ?? "");
}

/** "Today is closed — reopen it or wait until 4:00 AM." */
export function dayClosedMessage(cutoffLabel: string): string {
  return `Today is closed — reopen it from Day close, or wait until ${cutoffLabel} to start a shift.`;
}
