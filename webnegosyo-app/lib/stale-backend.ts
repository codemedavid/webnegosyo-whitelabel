/**
 * Recognising a tenant whose Convex deployment is behind this app.
 *
 * Every store runs its own Convex deployment, pushed from a pre-built bundle by
 * the superadmin. Stores are re-pushed in bulk, not continuously, so at any
 * moment a good number of them are several bundles behind the app talking to
 * them — some are still on v5 while the app ships arguments learned at v9, v15
 * and v18.
 *
 * An old deployment does not fail vaguely: its validator rejects the exact
 * argument it has never heard of. That is a recoverable "this store needs a
 * backend update", not a bug in the sale being rung up, and it must be said
 * that way to whoever is standing at the till.
 *
 * The markers live here rather than in `hooks.ts` so the read path and the
 * write path agree on what counts as a stale deployment.
 */

/** Convex's wording when the function itself is absent from the bundle. */
const MISSING_FN_MARKER = "Could not find public function";

const STALE_BUNDLE_MARKERS = [
  MISSING_FN_MARKER,
  // A value the validator does not accept — e.g. source: "pos" against a
  // deployment older than v9, whose union is still web | mobile.
  "ArgumentValidationError",
  // An argument the validator does not know — e.g. outletId before v15.
  "is not in the validator",
];

/** True when `message` is a deployment running an older bundle, not a real failure. */
export function isStaleBundleError(message: string): boolean {
  return STALE_BUNDLE_MARKERS.some((marker) => message.includes(marker));
}

/** True when the failure is specifically a function missing from the bundle. */
export function isMissingFunctionError(message: string): boolean {
  return message.includes(MISSING_FN_MARKER);
}

const STALE_BUNDLE_ADVICE =
  "This store needs a backend update before it can take this action. " +
  "Ask support to redeploy the store, then try again. It was not saved and no " +
  "payment was recorded, so it can safely be repeated once the store is updated.";

const GENERIC_ADVICE = "Please try again.";

/**
 * What to show a merchant for a failed write.
 *
 * A stale deployment rejects the request outright, so nothing was written —
 * which is the one thing a cashier needs to know before deciding whether to
 * ring the sale up again.
 */
export function staleBackendMessage(err: unknown): string {
  if (!(err instanceof Error) || !err.message) return GENERIC_ADVICE;
  if (isStaleBundleError(err.message)) return STALE_BUNDLE_ADVICE;
  return err.message;
}
