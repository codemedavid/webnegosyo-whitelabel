/**
 * Over/short per cashier across recent shifts (06 §4.5, W3.1
 * report_cash_summary / report_cash_by_staff). Shown as a pattern — "Ana was
 * short 2 times in the last 5 shifts" — never a verdict; shortages are
 * recorded, never deducted from pay (plan invariant, Labor Code 113–115).
 * A forced close has no count: it is a gap, not an "exact".
 */
import { countVerdict } from "../../lib/cash/reasons";
import { formatCents } from "../../lib/expenses/expense-format";

export interface OverShortShift {
  id: string;
  /** "Oct 24" — what the bar is called. */
  label: string;
  /** counted − expected; null = not counted (forced close). */
  differenceCents: number | null;
}

export interface OverShortSummary {
  shifts: number;
  shortCount: number;
  overCount: number;
  exactCount: number;
  uncountedCount: number;
  totalCents: number;
}

export type BarDirection = "short" | "over" | "exact" | "none";

export interface OverShortBar {
  id: string;
  label: string;
  direction: BarDirection;
  /** 0..1 of the biggest miss in the strip. */
  ratio: number;
  differenceCents: number | null;
}

export function overShortSummary(shifts: readonly OverShortShift[]): OverShortSummary {
  return shifts.reduce<OverShortSummary>(
    (acc, shift) => {
      if (shift.differenceCents === null) return { ...acc, uncountedCount: acc.uncountedCount + 1 };
      const verdict = countVerdict(shift.differenceCents);
      return {
        ...acc,
        shortCount: acc.shortCount + (verdict === "short" ? 1 : 0),
        overCount: acc.overCount + (verdict === "over" ? 1 : 0),
        exactCount: acc.exactCount + (verdict === "exact" ? 1 : 0),
        totalCents: acc.totalCents + shift.differenceCents,
      };
    },
    { shifts: shifts.length, shortCount: 0, overCount: 0, exactCount: 0, uncountedCount: 0, totalCents: 0 },
  );
}

function times(count: number): string {
  return count === 1 ? "once" : `${count} times`;
}

/** The one line under the strip. */
export function overShortSentence(name: string, summary: OverShortSummary): string {
  const counted = summary.shifts - summary.uncountedCount;
  if (counted === 0) return "No counted shifts yet";
  if (summary.shortCount === 0 && summary.overCount === 0) return `${name} matched the drawer on every counted shift`;
  const parts = [
    ...(summary.shortCount > 0 ? [`short ${times(summary.shortCount)}`] : []),
    ...(summary.overCount > 0 ? [`over ${times(summary.overCount)}`] : []),
  ];
  return `${name} was ${parts.join(" and ")} in the last ${summary.shifts} shifts · ${formatCents(summary.totalCents, { compact: true })} in all`;
}

export function overShortBars(shifts: readonly OverShortShift[]): OverShortBar[] {
  const biggest = shifts.reduce((max, s) => Math.max(max, Math.abs(s.differenceCents ?? 0)), 0);
  return shifts.map((shift) => {
    const diff = shift.differenceCents;
    const direction: BarDirection = diff === null ? "none" : countVerdict(diff);
    const ratio = diff === null || biggest === 0 ? 0 : Math.abs(diff) / biggest;
    return { id: shift.id, label: shift.label, direction, ratio, differenceCents: diff };
  });
}

/** "Oct 20: short ₱120" — what a screen reader hears for one bar. */
export function barLabel(bar: OverShortBar): string {
  if (bar.direction === "none" || bar.differenceCents === null) return `${bar.label}: not counted`;
  if (bar.direction === "exact") return `${bar.label}: exact`;
  return `${bar.label}: ${bar.direction} ${formatCents(Math.abs(bar.differenceCents), { compact: true })}`;
}
