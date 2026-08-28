/**
 * The register's one bounded, authenticated POST to the web app.
 *
 * Several things a counter sale must report — stock depletion, the Loyverse
 * receipt, customer capture, the voucher burn — happen on the web app, called
 * with the cashier's own session token. Each of them used to carry its own copy
 * of the same two lines:
 *
 *     const { data } = await supabase.auth.getSession();
 *     await fetch(url, { ... });
 *
 * Neither await had a deadline, and the tender screen awaits all four before it
 * clears `isCompleting`. So any one of them hanging left the footer spinner up
 * with no way out but force-quitting the app — the "second checkout just loads"
 * freeze.
 *
 * `getSession()` is the likelier half to hang. GoTrueClient serialises callers
 * behind whoever holds its storage lock, so a single stalled token refresh (see
 * `supabase-auth-refresh.ts` for how one starts) makes every later session read
 * in the process wait on it indefinitely. `voucher-service.ts` documented that
 * hazard for the read path first; this module is the same guarantee for the
 * write path, in one place rather than four.
 *
 * Contract: never throws, and always settles.
 */

import { getWebAppUrl } from "./web-app-url";
import { supabase } from "./supabase";

/**
 * How long a post-sale write waits before giving up.
 *
 * Longer than the 8s a voucher lookup allows itself, because this runs behind a
 * completed sale rather than in front of a waiting customer, and a write that
 * may have reached the server deserves a fair chance to be acknowledged. Short
 * enough that four of them in sequence cannot hold a cashier hostage.
 */
export const AUTHORIZED_POST_TIMEOUT_MS = 10_000;

export interface AuthorizedPostOptions {
  timeoutMs?: number;
}

/**
 * POST `body` to a web app route as the signed-in cashier.
 *
 * Returns whether the route accepted it. Callers behind a completed sale ignore
 * the answer — the point is that they get one at all.
 */
export async function postAuthorized(
  path: string,
  body: unknown,
  options: AuthorizedPostOptions = {},
): Promise<boolean> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  // Aborted AND raced, for the reason `voucher-service` documents: the abort
  // releases the socket, but React Native's fetch has not always propagated an
  // abort as a rejection, and relying on it alone is how a spinner outlives the
  // timeout meant to end it. The race is what guarantees this function returns.
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("timeout"));
    }, options.timeoutMs ?? AUTHORIZED_POST_TIMEOUT_MS);
  });

  try {
    // The session read is inside the deadline, not before it: a client whose
    // auth lock is held by a stalled refresh hangs HERE, not in fetch, and a
    // deadline that only started afterwards would never fire.
    const { data } = await Promise.race([supabase.auth.getSession(), expiry]);
    const token = data.session?.access_token;
    if (!token) return false;

    const response = await Promise.race([
      fetch(`${getWebAppUrl()}${path}`, {
        signal: controller.signal,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      }),
      expiry,
    ]);

    return response.ok === true;
  } catch {
    // Best-effort by design — the sale is rung up and paid for by the time any
    // caller reaches here. A ledger that drifts is reconcilable; a register
    // that will not close a tender is not.
    return false;
  } finally {
    clearTimeout(timer);
  }
}
