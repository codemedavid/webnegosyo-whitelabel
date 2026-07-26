/**
 * Cash-drawer arithmetic for the POS register.
 *
 * Pure and side-effect free — every peso the cashier hands back to a customer
 * is computed here, so this module is the one place float drift is allowed to
 * be dealt with. All amounts are rounded to whole centavos before they leave a
 * function; callers must never re-derive change from raw subtraction.
 */

/** Round notes a Philippine till realistically holds, largest last. */
const TENDER_STEPS = [50, 100, 500, 1000] as const;

/** Keypad width — a fifth chip would wrap the suggestion row on small phones. */
const MAX_SUGGESTIONS = 4;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isUsableAmount(n: number): boolean {
  return Number.isFinite(n) && n >= 0;
}

export interface ChangeResult {
  /** Peso amount to hand back. Always 0 when the tender is not sufficient. */
  changeDue: number;
  /** True only when the tender covers the total in full. */
  isSufficient: boolean;
}

const NO_CHANGE: ChangeResult = { changeDue: 0, isSufficient: false };

/**
 * Change owed for a cash sale.
 *
 * A short, negative, or non-finite tender is never treated as payment — the
 * caller keeps the sale open rather than completing it with bad arithmetic.
 */
export function computeChange(total: number, tendered: number): ChangeResult {
  if (!isUsableAmount(total) || !isUsableAmount(tendered)) return NO_CHANGE;

  const due = round2(tendered - total);
  if (due < 0) return NO_CHANGE;

  return { changeDue: due, isSufficient: true };
}

/**
 * Quick-tender chips: the exact amount, then the next round note above it.
 *
 * Ascending, deduped, never below the total, and capped so the chip row stays
 * on one line. An unpayable total (zero, negative, non-finite) offers nothing.
 */
export function quickTenderSuggestions(total: number): number[] {
  if (!isUsableAmount(total) || total === 0) return [];

  const exact = round2(total);
  const rounded = TENDER_STEPS.map((step) => Math.ceil(exact / step) * step);

  return [...new Set([exact, ...rounded])]
    .sort((a, b) => a - b)
    .slice(0, MAX_SUGGESTIONS);
}
