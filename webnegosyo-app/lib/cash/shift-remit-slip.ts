/**
 * The remittance slip for one handover (06 §4.3 "Remittance slip"): the
 * stored remittance, its shift and the shift's cash moves, turned into the
 * shared slip builder's input (lib/cash-slips/remittance-slip.ts), plus the
 * status line above the paper. Nothing is recomputed that the server stored:
 * expected and counted come from the shift's close; cash sales are only
 * derived back from them (expected − float − pay-ins + pay-outs + pickups),
 * and stay unknown when expected is unknown. Pure.
 */

import type { RemittanceNonCashRow, RemittancePickup, RemittanceSlipInput } from "../cash-slips/remittance-slip";
import { formatClock } from "../staff-format";
import { parseCounts } from "./denominations";
import { isVarianceReasonKey } from "./reasons";
import type { Remittance } from "./remittances";
import type { ShiftDetail } from "../shift-service";

export interface SlipMove {
  kind: "pay_in" | "pay_out" | "collect";
  cents: number;
  at: string;
  takenByName: string | null;
}

export interface SlipSources {
  remittance: Remittance;
  shift: ShiftDetail | null;
  moves: readonly SlipMove[];
  /** The standing count's source (shift_counts.expected_source); "device" prints "Counted on this tablet". */
  expectedSource?: "server" | "device" | "none" | null;
}

function sum(moves: readonly SlipMove[], kind: SlipMove["kind"]): number {
  return moves.filter((m) => m.kind === kind).reduce((total, m) => total + m.cents, 0);
}

const CHECKS = new Set(["matches", "different", "unchecked"]);

/** `staff_shifts.closing_non_cash` rows ({ method, expectedCents, slipCount, check, declaredCents }); anything else is skipped. */
export function slipNonCash(raw: unknown): RemittanceNonCashRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): RemittanceNonCashRow[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const label = typeof row.method === "string" ? row.method : typeof row.label === "string" ? row.label : null;
    const cents = typeof row.expectedCents === "number" ? row.expectedCents : null;
    if (!label || cents === null) return [];
    const check = CHECKS.has(row.check as string) ? (row.check as RemittanceNonCashRow["check"]) : "unchecked";
    return [
      {
        label,
        cents,
        count: typeof row.slipCount === "number" ? row.slipCount : 0,
        check,
        declaredCents: check === "different" && typeof row.declaredCents === "number" ? row.declaredCents : null,
      },
    ];
  });
}

function howOf(remittance: Remittance): "phone" | "pin" | "safe" | null {
  if (remittance.acceptMethod === "pin") return "pin";
  if (remittance.toSafe) return "safe";
  return remittance.acceptMethod === "app" ? "phone" : null;
}

export function remittanceSlipInput({ remittance, shift, moves, expectedSource = null }: SlipSources): RemittanceSlipInput {
  const startingCents = shift ? Math.round(shift.openingFloat * 100) : 0;
  const payInCents = sum(moves, "pay_in");
  const payOutCents = sum(moves, "pay_out");
  const pickups: RemittancePickup[] = moves
    .filter((m) => m.kind === "collect")
    .map((m) => ({ cents: m.cents, takenByName: m.takenByName, at: m.at }));
  const pickupCents = pickups.reduce((total, p) => total + p.cents, 0);
  const expectedCents = remittance.shift?.expectedCents ?? null;
  const countedCents = remittance.shift?.countedCents ?? null;
  const handedOverCents = remittance.handedOverCents;
  return {
    businessDay: remittance.businessDay,
    drawerName: remittance.shift?.drawerName ?? shift?.drawerName ?? null,
    cashierName: remittance.cashierName,
    shiftOpenedAt: remittance.shift?.openedAt ?? shift?.openedAt ?? remittance.createdAt,
    shiftClosedAt: remittance.shift?.closedAt ?? shift?.closedAt ?? null,
    startingCashCents: startingCents,
    cashSalesCents: expectedCents === null ? null : expectedCents - startingCents - payInCents + payOutCents + pickupCents,
    payInCents,
    payOutCents,
    pickups,
    expectedCents,
    expectedSource,
    countedCents,
    reasonKey: isVarianceReasonKey(remittance.shift?.varianceReason) ? remittance.shift?.varianceReason : null,
    reasonNote: shift?.note ?? null,
    // The stored float kept wins; older closes derive it from the count and the handover.
    floatKeptCents:
      shift?.floatKeptCents ?? (countedCents !== null && handedOverCents !== null ? Math.max(0, countedCents - handedOverCents) : 0),
    handedOverCents,
    nonCash: slipNonCash(shift?.closingNonCash),
    denominations: parseCounts(shift?.closingDenominations),
    receiver: {
      name: remittance.receivedByName ?? remittance.remittedToName ?? null,
      status: remittance.status,
      how: howOf(remittance),
      at: remittance.receivedAt,
      receivedCents: remittance.receivedCents,
    },
  };
}

export interface SlipBanner {
  tone: "waiting" | "done" | "problem";
  title: string;
  detail: string | null;
}

/** The line above the paper: who has it, or who it is waiting for. */
export function slipBanner(remittance: Remittance): SlipBanner {
  const to = remittance.remittedToName;
  if (remittance.status === "pending") {
    if (remittance.toSafe) return { tone: "waiting", title: "In the store safe.", detail: to ? `${to} accepts it when the safe is opened.` : "Whoever opens the safe accepts it." };
    return to
      ? { tone: "waiting", title: `Waiting for ${to} to accept.`, detail: "They got a notification." }
      : { tone: "waiting", title: "Waiting for someone who manages cash to accept.", detail: null };
  }
  const by = remittance.receivedByName ?? to ?? "the receiver";
  const at = remittance.receivedAt ? `, ${formatClock(remittance.receivedAt)}` : "";
  if (remittance.status === "accepted") {
    return { tone: "done", title: `Accepted by ${by}${remittance.acceptMethod === "pin" ? " with PIN" : ""}${at}`, detail: null };
  }
  if (remittance.status === "disputed") {
    return { tone: "problem", title: `${by} reported a different amount.`, detail: remittance.disputeReason };
  }
  return { tone: "done", title: "Settled by the owner.", detail: remittance.resolutionNote };
}

/** "Salamat, Ana!" — the one warm Taglish touch, for the cashier who just closed. */
export function farewell(remittance: Remittance, viewerUserId: string | null): string | null {
  if (remittance.kind !== "shift" || !viewerUserId || remittance.cashierUserId !== viewerUserId) return null;
  const first = remittance.cashierName.trim().split(/\s+/)[0] || remittance.cashierName;
  return `Your shift is closed. Salamat, ${first}!`;
}
