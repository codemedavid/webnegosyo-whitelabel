// DAY CLOSE: the end-of-day paper for one business day at one branch (06 §4.5,
// 07 §5.2). It reads the FROZEN day-close snapshot — net sales and payment
// methods from the one sales definition, the drawers shift by shift, cash to
// deposit, and the deposit itself — and adds nothing up beyond it.
//
// Stores whose sales live outside the platform close with the drawers only
// (`sales: null`); the slip then says so instead of printing a ₱0 day. Never
// titled "Z-READING": nothing in the platform is BIR-accredited (06 §8).
// Wired in wave 3; the input mirrors the snapshot (snapshot_version 1).

import type { PrintSegment } from "../printer";
import { countVerdict } from "../cash/reasons";
import {
  divider,
  leftRight,
  sectionLabel,
  slipBusinessDay,
  slipFooter,
  slipHeader,
  slipMoney,
  slipSafe,
  slipStamp,
  slipWindow,
  toSlipSegments,
  wrap,
  type SlipWidth,
} from "./slip-text";

export interface DayCloseMethodTotal {
  label: string;
  cents: number;
}

export interface DayCloseSales {
  orders: number;
  netCents: number;
  discountCents: number;
  collectedByMethod: readonly DayCloseMethodTotal[];
  unpaidCents: number;
  overpaidCents: number;
}

export interface DayCloseShiftRow {
  staffName: string;
  drawerName: string | null;
  /** counted / forced (closed by a manager without a count). */
  closeKind: "counted" | "forced";
  handedOverCents: number | null;
  /** counted − expected; null when unknown (forced close). */
  differenceCents: number | null;
  remittanceStatus: "pending" | "accepted" | "disputed" | "resolved" | null;
}

export interface DayCloseDeposit {
  cents: number;
  /** "BDO savings", "Safe". */
  to: string | null;
  ref: string | null;
}

export interface DayCloseSlipInput {
  businessDay: string;
  windowStart: string;
  windowEnd: string;
  /** 1 for the first close; a re-close after a reopen is 2, 3… */
  version: number;
  closedByName: string;
  closedAt: string;
  /** Null when the store's sales are not on the platform (drawers only). */
  sales: DayCloseSales | null;
  shifts: readonly DayCloseShiftRow[];
  payOutCents: number;
  expensesFromDrawerCents: number;
  /** Σ counted − Σ expected over the day's shifts. */
  differenceCents: number | null;
  floatsKeptCents: number;
  cashToDepositCents: number;
  deposit: DayCloseDeposit | null;
  /** What was skipped when closing anyway ("1 remittance waiting"). */
  skipped: readonly string[];
  note: string | null;
}

export interface DayCloseSlipOptions {
  storeName: string;
  branchName?: string;
  width: SlipWidth;
  printedAt: Date;
}

export const DAY_CLOSE_TITLE = "DAY CLOSE";
export const DRAWERS_ONLY_LINE = "Sales totals for this store are not on this slip. Drawer figures only.";

const REMIT_WORD: Record<NonNullable<DayCloseShiftRow["remittanceStatus"]>, string> = {
  pending: "waiting",
  accepted: "accepted",
  disputed: "questioned",
  resolved: "settled",
};

function differenceText(cents: number | null): string {
  if (cents === null) return "--";
  const verdict = countVerdict(cents);
  if (verdict === "exact") return "exact";
  return `${verdict} ${slipMoney(Math.abs(cents))}`;
}

function salesLines(sales: DayCloseSales | null, w: SlipWidth): string[] {
  if (!sales) return [divider(w), ...wrap(DRAWERS_ONLY_LINE, w)];
  return [
    divider(w),
    leftRight("Orders", String(sales.orders), w),
    `<B>${leftRight("NET SALES", slipMoney(sales.netCents), w)}</B>`,
    leftRight("Discounts", slipMoney(-sales.discountCents), w),
    ...sales.collectedByMethod.map((m) => leftRight(slipSafe(m.label), slipMoney(m.cents), w)),
    leftRight("Unpaid", slipMoney(sales.unpaidCents), w),
    ...(sales.overpaidCents !== 0 ? [leftRight("Overpaid", slipMoney(sales.overpaidCents), w)] : []),
  ];
}

function shiftLines(shifts: readonly DayCloseShiftRow[], w: SlipWidth): string[] {
  if (shifts.length === 0) return [divider(w), sectionLabel("BY SHIFT"), "  No shifts"];
  return [
    divider(w),
    sectionLabel("BY SHIFT"),
    ...shifts.flatMap((shift) => {
      const who = [slipSafe(shift.staffName), slipSafe(shift.drawerName)].filter(Boolean).join(" - ");
      const remit = shift.remittanceStatus ? `, ${REMIT_WORD[shift.remittanceStatus]}` : "";
      const forced = shift.closeKind === "forced" ? " (closed by manager)" : "";
      return [
        leftRight(who || "--", slipMoney(shift.handedOverCents), w),
        ...wrap(`${differenceText(shift.differenceCents)}${remit}${forced}`, w, "  "),
      ];
    }),
  ];
}

function cashLines(input: DayCloseSlipInput, w: SlipWidth): string[] {
  return [
    divider(w),
    ...(input.payOutCents !== 0 ? [leftRight("Pay outs", slipMoney(-Math.abs(input.payOutCents)), w)] : []),
    ...(input.expensesFromDrawerCents !== 0
      ? [leftRight("Expenses from drawer", slipMoney(-Math.abs(input.expensesFromDrawerCents)), w)]
      : []),
    leftRight("Short/over", differenceText(input.differenceCents), w),
    leftRight("Floats kept", slipMoney(input.floatsKeptCents), w),
    `<B>${leftRight("CASH TO DEPOSIT", slipMoney(input.cashToDepositCents), w)}</B>`,
  ];
}

function depositLines(input: DayCloseSlipInput, w: SlipWidth): string[] {
  const deposit = input.deposit;
  if (!deposit) return [leftRight("Deposit", "not recorded yet", w)];
  const gap = deposit.cents - input.cashToDepositCents;
  return [
    leftRight("Deposited", slipMoney(deposit.cents), w),
    ...(slipSafe(deposit.to) ? [leftRight("To", slipSafe(deposit.to), w)] : []),
    ...(slipSafe(deposit.ref) ? [leftRight("Ref", slipSafe(deposit.ref), w)] : []),
    ...(gap !== 0 ? [leftRight(gap < 0 ? "Less than cash to deposit" : "More than cash to deposit", slipMoney(Math.abs(gap)), w)] : []),
  ];
}

function closeLines(input: DayCloseSlipInput, w: SlipWidth): string[] {
  const note = slipSafe(input.note);
  return [
    divider(w),
    ...wrap(`Closed by ${slipSafe(input.closedByName) || "--"}, ${slipStamp(new Date(input.closedAt))}`, w),
    ...(input.version > 1 ? [`Re-closed (version ${input.version})`] : []),
    ...input.skipped.flatMap((line) => wrap(`Closed anyway: ${slipSafe(line)}`, w)),
    ...(note ? wrap(`Note: ${note}`, w) : []),
  ];
}

/** The window is half-open [start, end): its last minute is end − 1 min ("4:00 AM Sat - 3:59 AM Sun"). */
function lastMinuteOf(endIso: string): string {
  const end = new Date(endIso).getTime();
  return Number.isNaN(end) ? endIso : new Date(end - 60_000).toISOString();
}

/** The day close as lines (exported for the on-screen summary and tests). */
export function dayCloseLines(input: DayCloseSlipInput, opts: DayCloseSlipOptions): string[] {
  const w = opts.width;
  return [
    ...slipHeader(opts.storeName, opts.branchName, DAY_CLOSE_TITLE, w),
    divider(w),
    leftRight("Business day", slipBusinessDay(input.businessDay), w),
    leftRight("Window", slipWindow(input.windowStart, lastMinuteOf(input.windowEnd)), w),
    ...salesLines(input.sales, w),
    ...shiftLines(input.shifts, w),
    ...cashLines(input, w),
    ...depositLines(input, w),
    ...closeLines(input, w),
    ...slipFooter(w, opts.printedAt),
  ];
}

/** DAY CLOSE → the one text segment `printForRole("cashier", …)` takes. */
export function buildDayCloseSlip(input: DayCloseSlipInput, opts: DayCloseSlipOptions): PrintSegment[] {
  return toSlipSegments(dayCloseLines(input, opts));
}
