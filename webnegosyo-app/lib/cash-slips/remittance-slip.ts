// REMITTANCE SLIP: what the cashier hands over at the end of a shift, and to
// whom (06 §4.3, 07 §5.1). The money lines run in the order the money moved —
// starting cash, cash sales, paid in/out, pickups — down to what should be in
// the drawer, what was counted, the difference and its reason, the float kept
// and what was REMITTED. Then the GCash/card check, the bills and coins, and
// the two signature lines.
//
// The count is done by the time a slip exists, so it always shows the expected
// figure, blind store or not. A figure nobody knows (a forced close, sales not
// loaded) prints as "--", never 0. Wired in wave 2; the input mirrors
// `cash_remittances` + the closing columns on `staff_shifts`.

import type { PrintSegment } from "../printer";
import { PH_DENOMINATIONS, type DenominationCounts } from "../cash/denominations";
import { countVerdict, reasonLabel, type VarianceReasonKey } from "../cash/reasons";
import {
  DEVICE_SOURCE_LINE,
  divider,
  labelCountAmount,
  leftRight,
  sectionLabel,
  slipBusinessDay,
  slipFooter,
  slipHeader,
  slipMoney,
  slipSafe,
  slipSignedMoney,
  slipTime,
  slipWindow,
  toSlipSegments,
  wrap,
  type SlipWidth,
} from "./slip-text";

export type RemittanceStatus = "pending" | "accepted" | "disputed" | "resolved";
export type RemittanceAcceptedHow = "phone" | "pin" | "safe";
export type NonCashCheck = "matches" | "different" | "unchecked";

export interface RemittancePickup {
  cents: number;
  takenByName: string | null;
  at: string;
}

export interface RemittanceNonCashRow {
  label: string;
  count: number;
  /** What the store's records say this method took this shift. */
  cents: number;
  check: NonCashCheck;
  /** What the cashier says instead, when "different". */
  declaredCents?: number | null;
}

export interface RemittanceReceiver {
  name: string | null;
  status: RemittanceStatus;
  how?: RemittanceAcceptedHow | null;
  at?: string | null;
  /** What the receiver says arrived (accepted with a different amount). */
  receivedCents?: number | null;
}

export interface RemittanceSlipInput {
  /** "R-0241"; omitted until the server numbers it. */
  slipNumber?: string | null;
  businessDay: string | null;
  drawerName: string | null;
  cashierName: string;
  shiftOpenedAt: string;
  shiftClosedAt: string | null;
  startingCashCents: number;
  /** Null = not loaded (prints "--"). */
  cashSalesCents: number | null;
  payInCents: number;
  payOutCents: number;
  pickups: readonly RemittancePickup[];
  /** Null = nobody knows (forced close, sales not loaded). */
  expectedCents: number | null;
  /** Who added up `expectedCents`: "device" prints "Counted on this tablet" under it. */
  expectedSource?: "server" | "device" | "none" | null;
  countedCents: number | null;
  reasonKey?: VarianceReasonKey | null;
  reasonNote?: string | null;
  floatKeptCents: number;
  handedOverCents: number | null;
  nonCash: readonly RemittanceNonCashRow[];
  denominations: DenominationCounts | null;
  receiver: RemittanceReceiver;
}

export interface RemittanceSlipOptions {
  storeName: string;
  branchName?: string;
  width: SlipWidth;
  printedAt: Date;
}

export const REMITTANCE_SLIP_TITLE = "REMITTANCE SLIP";

const CHECK_WORD: Record<NonCashCheck, string> = { matches: "ok", different: "DIFF", unchecked: "--" };

function headLines(input: RemittanceSlipInput, w: SlipWidth): string[] {
  return [
    ...(input.slipNumber ? [leftRight("Slip", `#${slipSafe(input.slipNumber).replace(/^#/, "")}`, w)] : []),
    leftRight("Business day", slipBusinessDay(input.businessDay), w),
    leftRight("Drawer", slipSafe(input.drawerName) || "--", w),
    leftRight("Cashier", slipSafe(input.cashierName) || "--", w),
    leftRight("Shift", slipWindow(input.shiftOpenedAt, input.shiftClosedAt), w),
  ];
}

function pickupLine(pickup: RemittancePickup, w: SlipWidth): string {
  const who = slipSafe(pickup.takenByName) || "safe";
  return leftRight(`Pickup (${who} ${slipTime(pickup.at)})`, slipMoney(-pickup.cents), w);
}

function differenceLines(input: RemittanceSlipInput, w: SlipWidth): string[] {
  if (input.expectedCents === null || input.countedCents === null) return [leftRight("Difference", "--", w)];
  const difference = input.countedCents - input.expectedCents;
  const verdict = countVerdict(difference);
  const head = verdict === "exact" ? leftRight("EXACT", "0.00", w) : `<B>${leftRight(verdict.toUpperCase(), slipMoney(Math.abs(difference)), w)}</B>`;
  const label = reasonLabel(input.reasonKey ?? null);
  const note = slipSafe(input.reasonNote);
  const reason = [label, note ? `"${note}"` : ""].filter(Boolean).join(": ");
  return [head, ...(reason ? wrap(reason, w, "  ") : [])];
}

function moneyLines(input: RemittanceSlipInput, w: SlipWidth): string[] {
  return [
    leftRight("Starting cash", slipMoney(input.startingCashCents), w),
    leftRight("Cash sales", slipMoney(input.cashSalesCents), w),
    ...(input.payInCents !== 0 ? [leftRight("Paid in", slipSignedMoney(input.payInCents), w)] : []),
    ...(input.payOutCents !== 0 ? [leftRight("Paid out", slipMoney(-Math.abs(input.payOutCents)), w)] : []),
    ...input.pickups.map((pickup) => pickupLine(pickup, w)),
    leftRight("Should be in drawer", slipMoney(input.expectedCents), w),
    ...(input.expectedSource === "device" ? [`  ${DEVICE_SOURCE_LINE}`] : []),
    leftRight("Counted", slipMoney(input.countedCents), w),
    ...differenceLines(input, w),
    leftRight("Float kept", slipMoney(input.floatKeptCents), w),
    `<B>${leftRight("REMITTED", slipMoney(input.handedOverCents), w)}</B>`,
  ];
}

function nonCashLines(rows: readonly RemittanceNonCashRow[], w: SlipWidth): string[] {
  if (rows.length === 0) return [];
  return [
    divider(w),
    sectionLabel("GCASH & CARDS"),
    ...rows.flatMap((row) => {
      const line = labelCountAmount(`${slipSafe(row.label)} ${CHECK_WORD[row.check]}`, String(row.count), slipMoney(row.cents), w);
      const declared = row.check === "different" && row.declaredCents != null;
      return declared ? [line, leftRight("  Cashier says", slipMoney(row.declaredCents ?? null), w)] : [line];
    }),
  ];
}

function pieceText(label: string, count: number): string {
  return `${slipSafe(label)}x${count}`;
}

/** "Bills P1000x4 P500x3 …" wrapped to the paper; loose coins by total on their own line. */
function denominationLines(counts: DenominationCounts | null, w: SlipWidth): string[] {
  if (!counts) return [];
  const pieces = (kind: "bill" | "coin") =>
    PH_DENOMINATIONS.filter((d) => d.kind === kind && (counts[d.key] ?? 0) > 0).map((d) => pieceText(d.label, counts[d.key] ?? 0));
  const bills = pieces("bill");
  const coins = pieces("coin");
  const loose = counts.loose_coins_cents ?? 0;
  if (bills.length === 0 && coins.length === 0 && loose === 0) return [];
  return [
    divider(w),
    ...(bills.length ? wrap(`Bills ${bills.join(" ")}`, w) : []),
    ...(coins.length ? wrap(`Coins ${coins.join(" ")}`, w) : []),
    ...(loose > 0 ? [leftRight("Coins by total", slipMoney(loose), w)] : []),
  ];
}

const HOW_WORD: Record<RemittanceAcceptedHow, string> = { phone: "on phone", pin: "with PIN", safe: "from safe" };

function receiverLines(receiver: RemittanceReceiver, handedOverCents: number | null, w: SlipWidth): string[] {
  const name = slipSafe(receiver.name) || "the store safe";
  const how = receiver.how ? ` ${HOW_WORD[receiver.how]}` : "";
  const at = receiver.at ? ` ${slipTime(receiver.at)}` : "";
  const status: Record<RemittanceStatus, string> = {
    pending: `Waiting for ${name}`,
    accepted: `Accepted by ${name}${how}${at}`,
    disputed: `Questioned by ${name}${at}`,
    resolved: `Settled by ${name}${at}`,
  };
  const received = receiver.receivedCents;
  const isDifferent = received != null && handedOverCents != null && received !== handedOverCents;
  return [
    divider(w),
    "Remitted by ______________",
    "",
    "Received by ______________",
    ...wrap(status[receiver.status], w),
    ...(isDifferent ? [leftRight("Received", slipMoney(received), w)] : []),
  ];
}

/** The remittance slip as lines (exported for the on-screen slip and tests). */
export function remittanceSlipLines(input: RemittanceSlipInput, opts: RemittanceSlipOptions): string[] {
  const w = opts.width;
  return [
    ...slipHeader(opts.storeName, opts.branchName, REMITTANCE_SLIP_TITLE, w),
    divider(w),
    ...headLines(input, w),
    divider(w),
    ...moneyLines(input, w),
    ...nonCashLines(input.nonCash, w),
    ...denominationLines(input.denominations, w),
    ...receiverLines(input.receiver, input.handedOverCents, w),
    ...slipFooter(w, opts.printedAt),
  ];
}

/** REMITTANCE SLIP → the one text segment `printForRole("cashier", …)` takes. */
export function buildRemittanceSlip(input: RemittanceSlipInput, opts: RemittanceSlipOptions): PrintSegment[] {
  return toSlipSegments(remittanceSlipLines(input, opts));
}
