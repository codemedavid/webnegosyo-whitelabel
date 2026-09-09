/**
 * The pure decisions behind cold-start session resolution (`useAuthInit` in
 * app/_layout.tsx).
 *
 * supabase-js reports a failed read as `{ data: null, error }` rather than
 * throwing, so "the network is down" and "this account no longer exists" used
 * to look identical, and both dropped the merchant on the login screen while
 * their stored session was perfectly valid. Only PostgREST's own "no rows"
 * answer may sign anyone out; everything else keeps the session and asks to
 * try again.
 */

/** PostgREST: `.single()` matched zero (or several) rows. */
const PGRST_NO_ROWS = "PGRST116";

export const BOOTSTRAP_UNREACHABLE_MESSAGE =
  "We couldn't reach WebNegosyo. Check your connection and try again.";

export interface LookupResponse<T> {
  data: T | null;
  error: { code?: string; message?: string } | null;
}

export interface UnreachableOutcome {
  kind: "unreachable";
  message: string;
}

export type LookupOutcome<T> = { kind: "row"; row: T } | { kind: "missing" } | UnreachableOutcome;

const UNREACHABLE: UnreachableOutcome = {
  kind: "unreachable",
  message: BOOTSTRAP_UNREACHABLE_MESSAGE,
};

export function classifyLookup<T>(response: LookupResponse<T>): LookupOutcome<T> {
  if (response.data) return { kind: "row", row: response.data };
  if (!response.error || response.error.code === PGRST_NO_ROWS) return { kind: "missing" };
  return UNREACHABLE;
}

/** A read that threw (network failure, timeout) — never a sign-out. */
export function outcomeForThrown(error: unknown): UnreachableOutcome {
  console.warn("[session] lookup threw:", error instanceof Error ? error.message : String(error));
  return UNREACHABLE;
}

export function isSignedOutOutcome(outcome: LookupOutcome<unknown>): boolean {
  return outcome.kind === "missing";
}
