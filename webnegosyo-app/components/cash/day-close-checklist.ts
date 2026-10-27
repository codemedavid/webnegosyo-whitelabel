/**
 * "Before you close" for a business day (06 §4.5 step 1), from
 * `get_day_close_status` (CONTRACTS W3.1).
 *
 * - An OPEN shift is the only hard block: it has no count, so the day can't
 *   be closed around it (the database refuses with 55000 open_shifts anyway).
 *   Its fix is "End their shift" (06 says "End for him"; neutral here) (force_close_shift).
 * - Remittances not settled and GCash/cards nobody checked only ask "Close
 *   anyway?" (decision 7) and are written into the close as what was skipped.
 *   In a store whose remittances are `required`, closing over unsettled ones
 *   needs `p_force` with a note.
 */
import type { RemittanceMode } from "../../lib/cash/settings";

/** The parts of get_day_close_status the checklist reads. */
export interface DayCloseStatusLike {
  openShifts: readonly { shiftId: string; staffName: string; drawerName: string | null; openedAt: string; overdue: boolean }[];
  pendingRemittances: readonly { id: string; cashierName: string; handedOverCents: number | null; status: string }[];
  nonCashUnchecked: readonly { shiftId: string; staffName: string; method: string }[];
}

export type ChecklistTone = "done" | "block" | "warn";
export type ChecklistActionKind = "end_shift" | "review_remittances" | "review_non_cash";

export interface ChecklistRow {
  key: string;
  tone: ChecklistTone;
  title: string;
  action?: { kind: ChecklistActionKind; label: string; targetId?: string };
}

export interface DayCloseReadiness {
  /** False while any shift is open. */
  canClose: boolean;
  /** Something was left: confirm "Close anyway?" and note it. */
  needsConfirm: boolean;
  /** close_business_day must be called with p_force (and a note). */
  needsForce: boolean;
  /** What closing anyway skips, in plain words (for the note and the slip). */
  skipped: string[];
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function shiftRows(status: DayCloseStatusLike, endedShiftCount: number | undefined): ChecklistRow[] {
  if (status.openShifts.length === 0) {
    const title = endedShiftCount === undefined ? "Every shift has ended" : `${plural(endedShiftCount, "shift", "shifts")} ended`;
    return [{ key: "shifts", tone: "done", title }];
  }
  return status.openShifts.map((shift) => ({
    key: `shifts:${shift.shiftId}`,
    tone: "block",
    title: shift.drawerName ? `${shift.staffName} is still on ${shift.drawerName}` : `${shift.staffName}'s shift is still open`,
    action: { kind: "end_shift", label: "End their shift", targetId: shift.shiftId },
  }));
}

function remittanceTitle(status: DayCloseStatusLike): string {
  return `${plural(status.pendingRemittances.length, "remittance", "remittances")} not settled`;
}

function remittanceRow(status: DayCloseStatusLike): ChecklistRow {
  if (status.pendingRemittances.length === 0) return { key: "remittances", tone: "done", title: "Every remittance is accepted" };
  return { key: "remittances", tone: "warn", title: remittanceTitle(status), action: { kind: "review_remittances", label: "Review" } };
}

function nonCashTitle(row: DayCloseStatusLike["nonCashUnchecked"][number]): string {
  return `${row.method} not checked on ${row.staffName}'s shift`;
}

function nonCashRows(status: DayCloseStatusLike): ChecklistRow[] {
  if (status.nonCashUnchecked.length === 0) return [{ key: "non_cash", tone: "done", title: "GCash & cards checked" }];
  return status.nonCashUnchecked.map((row) => ({
    key: `non_cash:${row.shiftId}`,
    tone: "warn",
    title: nonCashTitle(row),
    action: { kind: "review_non_cash", label: "Look", targetId: row.shiftId },
  }));
}

export function buildDayCloseChecklist(status: DayCloseStatusLike, opts: { endedShiftCount?: number }): ChecklistRow[] {
  return [...shiftRows(status, opts.endedShiftCount), remittanceRow(status), ...nonCashRows(status)];
}

export function dayCloseReadiness(status: DayCloseStatusLike, remittanceMode: RemittanceMode): DayCloseReadiness {
  const skipped = [
    ...(status.pendingRemittances.length > 0 ? [remittanceTitle(status)] : []),
    ...status.nonCashUnchecked.map(nonCashTitle),
  ];
  return {
    canClose: status.openShifts.length === 0,
    needsConfirm: skipped.length > 0,
    needsForce: remittanceMode === "required" && status.pendingRemittances.length > 0,
    skipped,
  };
}
