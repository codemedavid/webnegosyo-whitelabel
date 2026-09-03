/**
 * Whether this tenant's Convex deployment can be told what the service charge
 * was.
 *
 * The charge is stored on the order from schema v23 (`orders.serviceCharge`,
 * accepted by `createOrder` and patched by `reviseOrder`). Convex validates
 * mutation arguments strictly: sending the field to an older deployment does
 * not degrade the write, it rejects the whole mutation. A register that sent it
 * unconditionally would stop being able to ring up a sale — and an edit would
 * stop being able to save — at every store not yet redeployed.
 *
 * So the argument is withheld below v23. Those tenants keep the behaviour they
 * have always had: the charge is inside `total` and recoverable only as the
 * anonymous residue, which is precisely what redeploying fixes.
 *
 * Mirrors `convexScheduledForArg` in the web app, deliberately — same problem,
 * same shape, so neither is a surprise to whoever meets the other first.
 */

/** The schema version whose `orders` table first had somewhere to put it. */
export const CONVEX_SERVICE_CHARGE_MIN_VERSION = 23;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The `serviceCharge` argument to spread into a Convex order mutation, or
 * nothing at all.
 *
 * Returns an EMPTY OBJECT rather than `{ serviceCharge: undefined }`: Convex's
 * validator sees the key either way, so the explicit undefined would be
 * rejected by exactly the deployments this exists to protect.
 */
export function convexServiceChargeArg(
  serviceCharge: number | null | undefined,
  convexSchemaVersion: number | null | undefined,
): { serviceCharge: number } | Record<string, never> {
  // A corrupt or absent amount has nothing true to say, whatever the version.
  if (
    serviceCharge === null ||
    serviceCharge === undefined ||
    !Number.isFinite(serviceCharge) ||
    serviceCharge <= 0
  ) {
    return {};
  }

  // An unrecorded version counts as the oldest: a tenant whose version was
  // never written was most likely deployed before versions were tracked, and
  // guessing optimistically would break their register.
  if ((convexSchemaVersion ?? 0) < CONVEX_SERVICE_CHARGE_MIN_VERSION) return {};

  return { serviceCharge: round2(serviceCharge) };
}
