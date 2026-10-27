/**
 * A pickup names who took the cash (06 §4.2): a person on shift in this
 * branch, or the store safe. It is then a partial remittance the receiver
 * accepts, so cash can no longer vanish between the drawer and the owner.
 * `record_cash_pickup` writes the move and its remittance in one go; until
 * that function is on the database, the Drawer records the plain move it
 * always did. Pure.
 */

export type PickupTaker = { kind: "person"; userId: string; name: string } | { kind: "safe" };

export const PICKUP_COPY = {
  label: "Taken by",
  safe: "Store safe",
  required: "Choose who took the cash, or the store safe.",
} as const;

/** "Taken by" is required once the store can record it (the function is deployed and receivers are known). */
export function pickupTakerProblem(taker: PickupTaker | null, isAsked: boolean): string | null {
  return isAsked && !taker ? PICKUP_COPY.required : null;
}

export function pickupArgs(taker: PickupTaker | null): { takenBy: string | null; toSafe: boolean } {
  if (!taker) return { takenBy: null, toSafe: false };
  return taker.kind === "safe" ? { takenBy: null, toSafe: true } : { takenBy: taker.userId, toSafe: false };
}

/** "Pickup · Maria" / "Pickup · Store safe" — the line the moves list shows. */
export function pickupLine(taker: PickupTaker | null): string {
  if (!taker) return "Pickup";
  return `Pickup · ${taker.kind === "safe" ? PICKUP_COPY.safe : taker.name}`;
}

/** Pesos (the Drawer's money) to whole centavos for the RPC. */
export function pesosToCents(pesos: number): number {
  return Math.round(pesos * 100);
}
