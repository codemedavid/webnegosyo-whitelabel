/**
 * Stock on the move, as the phone shows it.
 *
 * The web admin's transfers screen is a desk view: a document with a status and
 * a history. This is not that. The merchant app's transfer list exists for one
 * moment above every other — somebody at a receiving bench with a box in front
 * of them — so the ordering here answers "what should I be counting right now?"
 * rather than "what happened this week".
 *
 * Deliberately a small port rather than a shared import: `src/` and the Expo
 * app do not share a module graph, and the alternative (a published package for
 * five pure functions) would cost more than the duplication. What must not
 * drift is the WORDING — `TRANSFER_STATUS_LABELS` says "In transit" here for
 * the same reason it does on the web, and a merchant reading both surfaces must
 * not be told two different things about one box.
 *
 * Pure: nothing here queries or writes, which is also what lets it run under
 * the app's Jest, since that only picks up lib/ and theme/.
 */

/** Mirrors `src/lib/inventory/stock-transfer.ts`. */
export type TransferStatus = "draft" | "sent" | "received" | "cancelled";

export const TRANSFER_STATUS_LABELS: Record<TransferStatus, string> = {
  draft: "Draft",
  // Not "Sent". "Sent" answers what the office did; the person holding a
  // clipboard is asking where the stock is.
  sent: "In transit",
  received: "Received",
  cancelled: "Cancelled",
};

/** One transfer, as the list needs it. */
export interface TransferSummary {
  id: string;
  status: TransferStatus;
  /** `null` is the unbranched store pool, where a single-shop tenant's stock sits. */
  fromOutletId: string | null;
  toOutletId: string | null;
  lineCount: number;
  createdAt: string;
}

/** Branch names by id, as the screen has resolved them. */
export type BranchNames = Readonly<Record<string, string>>;

/**
 * What to call one end of a transfer.
 *
 * The store pool is named "Store" rather than left blank — a dangling arrow
 * with nothing on one side reads as a bug rather than as the store. An
 * unresolvable branch (no RLS reach, or deleted since) degrades to a neutral
 * word instead of an empty string, because losing the name must never lose the
 * direction: the direction is the part that decides where somebody carries a
 * box.
 */
function branchLabel(outletId: string | null, names: BranchNames): string {
  if (outletId === null) return "Store";
  return names[outletId] ?? "Another branch";
}

/**
 * The direction, as one readable phrase.
 *
 * The arrow is a text character, not an icon, for the same reason it is on the
 * web panel: an aria-hidden icon between two branch names announces as
 * "North South", which is the one reading that could send stock the wrong way.
 */
export function describeTransferDirection(
  transfer: Pick<TransferSummary, "fromOutletId" | "toOutletId">,
  names: BranchNames,
): string {
  return `${branchLabel(transfer.fromOutletId, names)} → ${branchLabel(transfer.toOutletId, names)}`;
}

/**
 * Is this a box somebody still has to count in?
 *
 * Only `sent`. A draft has moved nothing — showing it here would send someone
 * looking for a box that was never loaded — and a received transfer is history.
 */
export function isAwaitingCount(transfer: Pick<TransferSummary, "status">): boolean {
  return transfer.status === "sent";
}

/**
 * The order a receiving bench wants.
 *
 * Anything awaiting a count first, then oldest first within each group: a
 * consignment sitting since morning is the one everybody has stopped chasing,
 * and it is also the one most likely to have gone missing.
 *
 * Returns a new array. Sorting the caller's own list in place would reorder
 * whatever React state it came from behind the screen's back.
 */
export function sortTransfersForBench(
  transfers: readonly TransferSummary[],
): TransferSummary[] {
  return [...transfers].sort((left, right) => {
    const byUrgency = Number(isAwaitingCount(right)) - Number(isAwaitingCount(left));
    if (byUrgency !== 0) return byUrgency;

    return left.createdAt.localeCompare(right.createdAt);
  });
}
