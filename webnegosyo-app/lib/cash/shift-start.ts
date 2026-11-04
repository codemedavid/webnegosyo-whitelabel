/**
 * Start shift (06 §4.1), the parts worth testing: the "usual float" line,
 * which named shift (service period) to preselect, and what open_shift's
 * handover answer means to the cashier. Pure.
 */

import { servicePeriodOf } from "../business-day/service-periods";
import type { CutoffSchedule } from "../business-day/trading-day";
import { formatPeso } from "../expenses/keypad";
import type { ShiftHandover } from "./shift-close-parse";

export interface FloatNote {
  isUsual: boolean;
  text: string;
}

/** "Usual float ₱2,000" or "₱50 less than the usual ₱2,000. We'll note it for the owner." — never blocks. */
export function floatNote(countedCents: number | null, usualCents: number | null): FloatNote | null {
  if (usualCents === null || usualCents <= 0 || countedCents === null) return null;
  if (countedCents === usualCents) return { isUsual: true, text: `Usual float ${formatPeso(usualCents)}` };
  const diff = Math.abs(countedCents - usualCents);
  const direction = countedCents < usualCents ? "less" : "more";
  return { isUsual: false, text: `${formatPeso(diff)} ${direction} than the usual ${formatPeso(usualCents)}. We'll note it for the owner.` };
}

export interface PickablePeriod {
  id: string;
  name: string;
  startsMinutes: number;
  endsMinutes: number;
}

/** The named shift running now, so starting is still one tap; null when none is (or none set up). */
export function periodToPreselect<T extends PickablePeriod>(periods: readonly T[], nowIso: string, schedule: CutoffSchedule): T | null {
  if (periods.length === 0) return null;
  return servicePeriodOf(nowIso, periods, schedule)?.period ?? null;
}

/** After the start: what the last cashier left, when it differs from this count. Null = nothing to say. */
export function handoverNote(handover: ShiftHandover | null, countedCents: number): string | null {
  if (!handover || handover.leftCents === countedCents) return null;
  const who = handover.staffName ?? "The last cashier";
  const diff = countedCents - handover.leftCents;
  return `${who} left ${formatPeso(handover.leftCents)} in this drawer. You counted ${formatPeso(countedCents)}: ${formatPeso(Math.abs(diff))} ${diff < 0 ? "less" : "more"} than they left. It's noted on both shifts.`;
}
