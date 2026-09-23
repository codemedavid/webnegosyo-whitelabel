/**
 * The rebook rule for a Lalamove booking that died without delivering.
 *
 * Hand-synced mirror of src/lib/lalamove-status.ts (`isRebookableLalamoveStatus`)
 * and src/lib/lalamove-rebook.ts (`resolveRequoteGate`) — the deployment cannot
 * import from src/. If either rule changes there, change it here too.
 *
 * A cancelled booking used to keep its lalamoveOrderId forever, and requote and
 * book both refuse while it is set — one accidental Cancel stranded the order.
 */

/** Ended WITHOUT a delivery; COMPLETED/DELIVERED are final but never rebookable. */
const REBOOKABLE_STATUSES: ReadonlySet<string> = new Set([
  "CANCELED",
  "CANCELLED",
  "REJECTED",
  "EXPIRED",
]);

export function isRebookableLalamoveStatus(status: string | undefined): boolean {
  if (!status) return false;
  return REBOOKABLE_STATUSES.has(status.toUpperCase());
}

export type RequoteGate =
  | { ok: true; retiredOrderId: string | null }
  | { ok: false; error: string };

export function resolveRequoteGate(
  lalamoveOrderId: string | undefined,
  lalamoveStatus: string | undefined
): RequoteGate {
  const bookedId = lalamoveOrderId?.trim();
  if (!bookedId) return { ok: true, retiredOrderId: null };

  if (isRebookableLalamoveStatus(lalamoveStatus)) {
    return { ok: true, retiredOrderId: bookedId };
  }

  const status = lalamoveStatus?.toUpperCase();
  if (status === "COMPLETED" || status === "DELIVERED") {
    return { ok: false, error: "This delivery was already completed — there is nothing to rebook" };
  }
  // Includes a booking with no recorded status: it may well be live.
  return {
    ok: false,
    error: "A delivery is already booked for this order — cancel it before re-quoting",
  };
}
