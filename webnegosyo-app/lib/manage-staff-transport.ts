/**
 * The Team screen's bounded transport to the manage-staff edge function.
 *
 * The screen used to call `supabase.functions.invoke("manage-staff", …)`.
 * supabase-js hands its FunctionsClient a `customFetch` that awaits the
 * session before it touches the network:
 *
 *     const accessToken = await getAccessToken()   // -> auth.getSession()
 *     return fetch(input, { ...init, headers })
 *
 * and `invoke` wraps EVERYTHING that wrapper rejects with in a single
 * `FunctionsFetchError`, whose message is "Failed to send a request to the
 * Edge Function". So a session read that hung behind a stalled token refresh
 * (the hazard `authorized-post.ts` and `voucher-service.ts` already document —
 * GoTrue serialises every reader behind the storage lock) or one that failed
 * its refresh outright looked exactly like a dead network, produced no edge
 * log at all because the request never left the phone, and told the merchant
 * only "Could not save".
 *
 * This module is the replacement, built the same way as `postAuthorized`:
 * a deadline on the session read, a deadline on the request, one retry for a
 * dropped socket, and an error sentence the merchant can act on.
 *
 * It keeps the `ManageStaffInvoke` shape — `{ data, error }` — so
 * `lib/staff-service.ts` stays the only place that knows the wire format.
 */

import type { ManageStaffInvoke, ManageStaffRequest } from "./staff-service";

/**
 * How long the session read may take before the merchant is told to try again.
 * Matches the register's write path: long enough for a real token refresh on a
 * slow connection, short enough that a stalled lock cannot hold the screen.
 */
export const MANAGE_STAFF_SESSION_TIMEOUT_MS = 8_000;

/**
 * How long one attempt at the function may take. Creating a staff account is
 * two round trips inside the function (GoTrue, then the access row), so this
 * is more generous than the session read.
 */
export const MANAGE_STAFF_REQUEST_TIMEOUT_MS = 20_000;

const MESSAGES = {
  noSession: "You are signed out. Sign in again and retry.",
  sessionUnavailable: "Could not confirm your sign-in. Check your connection and try again.",
  connection: "Could not reach the server — check your connection and try again.",
  timeout: "The server took too long to answer. Try again.",
  unreadable: (status: number) => `The server answered with an error (${status}).`,
} as const;

export interface ManageStaffTransportDeps {
  /** Project functions root, e.g. `https://x.supabase.co/functions/v1`. */
  functionsUrl: string;
  /** Project key — the gateway refuses the call before the function runs without it. */
  anonKey: string;
  getSession: () => Promise<{ data: { session: { access_token: string } | null } }>;
  fetchImpl: typeof fetch;
  sessionTimeoutMs?: number;
  requestTimeoutMs?: number;
}

/** Rejects with `reason` once `ms` has passed; `cancel` clears the timer. */
function deadline(ms: number, reason: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(reason)), ms);
  });
  return { promise, cancel: () => clearTimeout(timer) };
}

/** Marks a failure as worth one more try: the socket died, nothing was read. */
class TransportError extends Error {}

async function readEnvelope(response: {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}): Promise<{ data: unknown; error: Error | null }> {
  const raw = await response.text();
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    // Not JSON — a gateway page or a crashed worker. Fall through.
  }

  if (response.ok) {
    // staff-service unwraps `{ success, data }`; a 2xx that is not JSON is a
    // contract break, and saying so beats handing it an undefined envelope.
    if (parsed === null) {
      return { data: null, error: new Error(MESSAGES.unreadable(response.status)) };
    }
    return { data: parsed, error: null };
  }

  const serverMessage = (parsed as { error?: string } | null)?.error;
  return {
    data: null,
    error: new Error(serverMessage || MESSAGES.unreadable(response.status)),
  };
}

/**
 * Build the Team screen's transport.
 *
 * Never throws: every failure comes back as `{ data: null, error }`, which is
 * what `staff-service.ts` unwraps into the merchant-facing alert.
 */
export function createManageStaffInvoke(
  deps: ManageStaffTransportDeps
): ManageStaffInvoke {
  const {
    functionsUrl,
    anonKey,
    getSession,
    fetchImpl,
    sessionTimeoutMs = MANAGE_STAFF_SESSION_TIMEOUT_MS,
    requestTimeoutMs = MANAGE_STAFF_REQUEST_TIMEOUT_MS,
  } = deps;
  const url = `${functionsUrl.replace(/\/$/, "")}/manage-staff`;

  /** The caller's own JWT, or a sentence explaining why there isn't one. */
  async function accessToken(): Promise<string> {
    const guard = deadline(sessionTimeoutMs, MESSAGES.sessionUnavailable);
    try {
      const { data } = await Promise.race([getSession(), guard.promise]);
      const token = data?.session?.access_token;
      if (!token) throw new Error(MESSAGES.noSession);
      return token;
    } finally {
      guard.cancel();
    }
  }

  async function attempt(token: string, body: ManageStaffRequest) {
    const controller = new AbortController();
    const guard = deadline(requestTimeoutMs, MESSAGES.timeout);
    try {
      // Aborted AND raced, for the reason `authorized-post.ts` documents:
      // React Native's fetch has not always surfaced an abort as a rejection,
      // and the race is what guarantees this settles.
      const response = await Promise.race([
        fetchImpl(url, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            apikey: anonKey,
          },
          body: JSON.stringify(body),
        }),
        guard.promise,
      ]).catch((error: unknown) => {
        controller.abort();
        // A deadline is a real answer; a rejected fetch means the request never
        // landed, which is the only case worth sending again.
        if (error instanceof Error && error.message === MESSAGES.timeout) throw error;
        throw new TransportError(MESSAGES.connection);
      });
      return await readEnvelope(response);
    } finally {
      guard.cancel();
    }
  }

  return async (body) => {
    let token: string;
    try {
      token = await accessToken();
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error(MESSAGES.sessionUnavailable),
      };
    }

    try {
      return await attempt(token, body);
    } catch (error) {
      if (!(error instanceof TransportError)) {
        return { data: null, error: error as Error };
      }
      // One retry: a phone that has just woken, or a keep-alive socket the
      // network dropped while the merchant was reading the screen, fails the
      // first send and succeeds on the second.
      try {
        return await attempt(token, body);
      } catch (retryError) {
        return { data: null, error: retryError as Error };
      }
    }
  };
}
