/**
 * The words and tones a remittance row shows. Pure, so every pill and status
 * line is tested once; verdicts always carry a word, never colour alone.
 */

import { formatPeso } from "../format";
import type { VerdictTone } from "../branch-verdict";
import { receivedDifference, shiftResult, type Remittance } from "./remittances";

export interface Pill {
  label: string;
  tone: VerdictTone;
}

const pesos = (cents: number): string => formatPeso(cents / 100, cents % 100 === 0 ? 0 : 2);

/** The cashier's count against expected: "Short ₱120" / "Exact" / "Over ₱20" / "Not counted". */
export function resultPill(remittance: Remittance): Pill {
  if (remittance.kind === "pickup") return { label: "Pickup", tone: "neutral" };
  const result = shiftResult(remittance);
  if (result.verdict === "unknown" || result.cents === null) {
    return { label: remittance.handedOverCents === null ? "Not counted" : "No result", tone: "neutral" };
  }
  if (result.verdict === "exact") return { label: "Exact", tone: "good" };
  if (result.verdict === "short") return { label: `Short ${pesos(result.cents)}`, tone: "bad" };
  return { label: `Over ${pesos(result.cents)}`, tone: "warn" };
}

/** Where the remittance stands, in words. */
export function statusLine(remittance: Remittance): string {
  const by = remittance.receivedByName ? ` by ${remittance.receivedByName}` : "";
  switch (remittance.status) {
    case "pending":
      if (remittance.remittedToName) return `Waiting for ${remittance.remittedToName}`;
      return remittance.toSafe ? "In the safe, waiting to be counted" : "Waiting to be accepted";
    case "accepted": {
      const difference = receivedDifference(remittance);
      const how = remittance.acceptMethod === "pin" ? " with PIN" : "";
      const self = remittance.isSelfReceived ? " (their own shift)" : "";
      const gap =
        difference === null || difference === 0
          ? ""
          : ` · ${pesos(Math.abs(difference))} ${difference < 0 ? "less" : "more"} than the slip`;
      return `Accepted${by}${how}${self}${gap}`;
    }
    case "disputed":
      return `Problem reported${by}: ${remittance.disputeReason ?? "no reason given"}`;
    case "resolved":
      return `Settled${remittance.resolvedByName ? ` by ${remittance.resolvedByName}` : ""}: ${remittance.resolutionNote ?? ""}`.trim();
  }
}

/** "₱6,345" or, after a forced close, "Not counted yet". */
export function amountLabel(remittance: Remittance): string {
  return remittance.handedOverCents === null ? "Not counted yet" : pesos(remittance.handedOverCents);
}

/** "Ana · Cashier 1" */
export function whoLine(remittance: Remittance): string {
  const drawer = remittance.shift?.drawerName;
  return drawer ? `${remittance.cashierName} · ${drawer}` : remittance.cashierName;
}

/** "6,300.50" / "6300" → 630050 centavos; null for anything that is not an amount. */
export function pesoTextToCents(text: string): number | null {
  const clean = text.replace(/[₱,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const [whole, fraction = ""] = clean.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export interface CashierOverShort {
  key: string;
  staffName: string;
  /** Oldest first, the last `limit` shifts — the shape shared's OverShortStrip draws. */
  shifts: { id: string; label: string; differenceCents: number | null }[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const shortDay = (dayKey: string | null, createdAt: string): string => {
  const key = dayKey ?? createdAt.slice(0, 10);
  const [, month, day] = key.split("-").map(Number);
  return month ? `${MONTHS[month - 1]} ${day}` : key;
};

/**
 * Each cashier's recent shifts as counted − expected, for the over/short
 * strip (06 §4.5 history). A pattern to read, never a verdict: the strip
 * words it. Forced closes stay in as "not counted".
 */
export function overShortByCashier(list: readonly Remittance[], limit = 14): CashierOverShort[] {
  const byCashier = new Map<string, CashierOverShort>();
  const shifts = list.filter((r) => r.kind === "shift").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const remittance of shifts) {
    const key = remittance.cashierUserId ?? remittance.cashierName;
    const entry = byCashier.get(key) ?? { key, staffName: remittance.cashierName, shifts: [] };
    const counted = remittance.shift?.countedCents ?? null;
    const expected = remittance.shift?.expectedCents ?? null;
    const next = {
      ...entry,
      shifts: [
        ...entry.shifts,
        {
          id: remittance.id,
          label: shortDay(remittance.businessDay, remittance.createdAt),
          differenceCents: counted === null || expected === null ? null : counted - expected,
        },
      ].slice(-limit),
    };
    byCashier.set(key, next);
  }
  return [...byCashier.values()].sort((a, b) => a.staffName.localeCompare(b.staffName));
}
