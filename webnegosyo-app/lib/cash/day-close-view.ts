/**
 * What the day close screens say (06 §4.5), from the frozen snapshot. Pure.
 * Unknown figures read "Not known" / are left out — never ₱0 — and short/over
 * is always a word, never only a colour.
 */

import { formatPeso } from "../format";
import type { DayCloseSlipInput } from "../cash-slips/day-close";
import { formatDayKey } from "./rules-form";
import type { DayCloseRecord, DayCloseSnapshot, DayCloseStatus, SnapshotShift } from "./day-close";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

const pesos = (cents: number): string => formatPeso(cents / 100, cents % 100 === 0 ? 0 : 2);
const signed = (cents: number): string => `${cents < 0 ? "−" : "+"}${pesos(Math.abs(cents))}`;

export function dayName(dayKey: string): string {
  return WEEKDAYS[new Date(`${dayKey}T00:00:00.000Z`).getUTCDay()];
}

/** "Close Friday". */
export function closeTitle(dayKey: string): string {
  return `Close ${dayName(dayKey)}`;
}

const manilaClock = (iso: string): string =>
  new Date(iso).toLocaleString("en-PH", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });

/** "Oct 24 · Fri 4:00 AM – Sat 3:59 AM". */
export function windowLine(dayKey: string, startIso: string | null, endIso: string | null): string {
  const date = formatDayKey(dayKey).split(", ")[1] ?? dayKey;
  if (!startIso || !endIso) return date;
  const lastMinute = new Date(Date.parse(endIso) - 60_000).toISOString();
  return `${date} · ${manilaClock(startIso)} – ${manilaClock(lastMinute)}`;
}

/** "Short ₱120" / "Over ₱5" / "Exact" / null when unknown. */
export function overShortWord(varianceCents: number | null): string | null {
  if (varianceCents === null) return null;
  if (varianceCents === 0) return "Exact";
  return `${varianceCents < 0 ? "Short" : "Over"} ${pesos(Math.abs(varianceCents))}`;
}

export interface HeroLine {
  label: string;
  value: string;
}

function floatsKeptCents(shifts: readonly SnapshotShift[]): number | null {
  let total = 0;
  for (const shift of shifts) {
    const handed = shift.remittance?.handedOverCents ?? null;
    if (shift.closeKind === "forced" || shift.countedCents === null || handed === null) continue;
    total += Math.max(0, shift.countedCents - handed);
  }
  return shifts.length === 0 ? null : total;
}

/** The ink hero: "Cash to deposit" and the lines that add up to it. */
export function heroOf(snapshot: DayCloseSnapshot): { cashToDeposit: string; lines: HeroLine[] } {
  const lines: HeroLine[] = [];
  if (snapshot.sales) {
    lines.push({ label: "Net sales", value: pesos(snapshot.sales.netCents) });
    for (const method of snapshot.sales.collectedByMethod) lines.push({ label: method.label, value: pesos(method.cents) });
  }
  if (snapshot.payOutCents) lines.push({ label: "Pay outs", value: signed(-snapshot.payOutCents) });
  if (snapshot.expenses.drawerCents) lines.push({ label: "Expenses from drawer", value: signed(-snapshot.expenses.drawerCents) });
  const variance = snapshot.totals.varianceCents;
  if (variance !== null && variance !== 0) lines.push({ label: "Short / over", value: signed(variance) });
  const floats = floatsKeptCents(snapshot.shifts);
  if (floats) lines.push({ label: "Floats kept for tomorrow", value: pesos(floats) });
  return {
    cashToDeposit: snapshot.cashToAccountForCents === null ? "Not known" : pesos(snapshot.cashToAccountForCents),
    lines,
  };
}

export interface ViewRow {
  key: string;
  title: string;
  detail: string;
}

/** By shift: "Ana · Cashier 1" — "Remitted ₱6,345 · Short ₱120". */
export function shiftRowsOf(snapshot: DayCloseSnapshot): ViewRow[] {
  return snapshot.shifts.map((shift) => {
    const title = shift.drawerName ? `${shift.staffName} · ${shift.drawerName}` : shift.staffName;
    if (shift.closeKind === "forced") {
      return { key: shift.shiftId, title, detail: "Ended by a manager · not counted" };
    }
    const handed = shift.remittance?.handedOverCents ?? null;
    const parts = [handed === null ? null : `Remitted ${pesos(handed)}`, overShortWord(shift.varianceCents)].filter(Boolean);
    return { key: shift.shiftId, title, detail: parts.join(" · ") || "Counted" };
  });
}

/** By named shift; "Other hours" carries what fell outside every named shift, so the rows add up to net sales. */
export function periodRowsOf(snapshot: DayCloseSnapshot): ViewRow[] {
  if (!snapshot.sales || snapshot.byServicePeriod.length === 0) return [];
  const rows = snapshot.byServicePeriod.map((period) => ({
    key: period.periodId,
    title: period.name,
    detail: `${pesos(period.netCents)} · ${period.orders} ${period.orders === 1 ? "order" : "orders"}`,
  }));
  if (snapshot.otherHoursNetCents) {
    rows.push({ key: "other", title: "Other hours", detail: pesos(snapshot.otherHoursNetCents) });
  }
  return rows;
}

/** "Ana counted twice: ₱0 → ₱8,345" — every attempt is kept, so the change is said. */
export function recountLinesOf(snapshot: DayCloseSnapshot): string[] {
  return snapshot.recountChanged.map((r) => `${r.staffName} counted twice: ${pesos(r.firstCents)} → ${pesos(r.finalCents)}`);
}

/** Home's receiver line: "Friday is ready to close" once nothing is open and the day had shifts. */
export function readyToClose(status: DayCloseStatus): { title: string; detail: string } | null {
  if (status.existingClose?.status === "closed" || status.openShifts.length > 0) return null;
  const shifts = status.preview?.shifts.length ?? 0;
  if (shifts === 0) return null;
  const deposit = status.preview?.cashToAccountForCents;
  const detail = [`${shifts} ${shifts === 1 ? "shift" : "shifts"} ended`, deposit === null || deposit === undefined ? null : `${pesos(deposit)} to deposit`]
    .filter(Boolean)
    .join(" · ");
  return { title: `${dayName(status.businessDay)} is ready to close`, detail };
}

/** One line of the history list. */
export function historyRowOf(record: DayCloseRecord): ViewRow {
  const title = formatDayKey(record.businessDay);
  if (record.status === "reopened") {
    return { key: `${record.id}`, title, detail: `Reopened${record.reopen?.byName ? ` by ${record.reopen.byName}` : ""}: ${record.reopen?.reason ?? ""}`.trim() };
  }
  const variance = overShortWord(record.snapshot?.totals.varianceCents ?? null);
  const deposit = record.deposit ? `Deposited ${pesos(record.deposit.cents)}` : "Deposit not recorded";
  return {
    key: record.id,
    title: record.version > 1 ? `${title} (closed again)` : title,
    detail: [deposit, variance, `closed by ${record.closedByName}`].filter(Boolean).join(" · "),
  };
}

/** The printable DAY CLOSE (shared slip builder) from a saved close. */
export function slipInputOf(record: DayCloseRecord, skipped: readonly string[] = []): DayCloseSlipInput | null {
  const snapshot = record.snapshot;
  if (!snapshot || !snapshot.windowStart || !snapshot.windowEnd) return null;
  return {
    businessDay: record.businessDay,
    windowStart: snapshot.windowStart,
    windowEnd: snapshot.windowEnd,
    version: record.version,
    closedByName: record.closedByName,
    closedAt: record.closedAt,
    sales: snapshot.sales,
    shifts: snapshot.shifts.map((shift) => ({
      staffName: shift.staffName,
      drawerName: shift.drawerName,
      closeKind: shift.closeKind,
      handedOverCents: shift.remittance?.handedOverCents ?? null,
      differenceCents: shift.varianceCents,
      remittanceStatus: (shift.remittance?.status as DayCloseSlipInput["shifts"][number]["remittanceStatus"]) ?? null,
    })),
    payOutCents: snapshot.payOutCents ?? 0,
    expensesFromDrawerCents: snapshot.expenses.drawerCents ?? 0,
    differenceCents: snapshot.totals.varianceCents,
    floatsKeptCents: floatsKeptCents(snapshot.shifts) ?? 0,
    cashToDepositCents: snapshot.cashToAccountForCents ?? 0,
    deposit: record.deposit ? { cents: record.deposit.cents, to: record.deposit.to, ref: record.deposit.ref } : null,
    skipped,
    note: record.note,
  };
}
