/**
 * What a staffer may do to a table right now, and how a refusal is worded.
 * The screen renders these verdicts; it never decides them.
 */

import { formatPeso } from "../format";
import type { TableOrderLike, TableView } from "./table-floor";

export type ClearVerdict =
  | { allowed: true; confirm: string | null }
  | { allowed: false; reason: string };

export const PARTY_SIZE_MIN = 1;
export const PARTY_SIZE_MAX = 99;

const COOKING_STATUSES: readonly string[] = ["pending", "confirmed", "preparing"];

/**
 * Clearing a table with food still coming would strand the plates; clearing
 * one that owes money is allowed but asked about, because the host may be
 * clearing a walk-out and needs to know what was lost.
 */
export function canClearTable(view: TableView): ClearVerdict {
  if (view.status === "ordered" || view.status === "ready") {
    return {
      allowed: false,
      reason: "The kitchen still has an order for this table. Serve it first, then clear.",
    };
  }
  if (!view.seating && view.orders.length === 0) {
    return { allowed: false, reason: "Nobody is seated here." };
  }
  if (view.unpaidTotal > 0) {
    return {
      allowed: true,
      confirm: `This table still owes ${formatPeso(view.unpaidTotal)}. Clear it anyway?`,
    };
  }
  return { allowed: true, confirm: null };
}

export function canSeat(view: TableView): boolean {
  return view.seating === null;
}

export function stepPartySize(current: number, delta: number): number {
  return Math.min(PARTY_SIZE_MAX, Math.max(PARTY_SIZE_MIN, current + delta));
}

/** A party larger than the table is common (a pulled-up chair) — warn, never block. */
export function partySizeWarning(partySize: number, seats: number): string | null {
  if (partySize <= seats) return null;
  return `This table seats ${seats}. Pull up ${partySize - seats} more.`;
}

/** The one order still being cooked, so "Add items" has an unambiguous target. */
export function singleAppendableOrder<O extends TableOrderLike>(view: TableView<O>): O | null {
  const cooking = view.orders.filter((order) => COOKING_STATUSES.includes(order.status));
  return cooking.length === 1 ? cooking[0] : null;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatSeatedFor(ms: number): string {
  const elapsed = Math.max(0, ms);
  if (elapsed >= DAY) {
    const days = Math.floor(elapsed / DAY);
    const hours = Math.floor((elapsed % DAY) / HOUR);
    return `${days}d ${hours}h`;
  }
  if (elapsed >= HOUR) {
    const hours = Math.floor(elapsed / HOUR);
    const minutes = Math.floor((elapsed % HOUR) / MINUTE);
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }
  return `${Math.floor(elapsed / MINUTE)}m`;
}
