/**
 * "Was that failure the network, or the server saying no?"
 *
 * The register's offline behaviour hangs on this one distinction: a sale that
 * could not reach the server is saved on the device and replayed later, while
 * a sale the server REFUSED (a validator rejection, a missing product) must be
 * shown to the cashier, because replaying it would only fail again.
 *
 * supabase-js, fetch and our own timeout wrappers all report the network
 * differently, so the patterns are collected here rather than in every caller.
 */

/** Messages RN's fetch and Node's fetch produce when there is no route out. */
const NETWORK_MESSAGE_PATTERNS: readonly RegExp[] = [
  /network request failed/i,
  /failed to fetch/i,
  /load failed/i,
  /fetch failed/i,
  /network error/i,
  /timed out/i,
  /timeout/i,
  /aborted/i,
  /ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT/,
  /could not reach/i,
  /unable to resolve host/i,
  /internet connection appears to be offline/i,
  /socket is not connected/i,
];

/** Error class names that only ever mean "could not reach the server". */
const NETWORK_ERROR_NAMES: ReadonlySet<string> = new Set([
  "AbortError",
  "TimeoutError",
  "AuthRetryableFetchError",
]);

interface ErrorLike {
  name?: unknown;
  message?: unknown;
  code?: unknown;
}

function messageOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const message = (error as ErrorLike).message;
    if (typeof message === "string") return message;
  }
  return "";
}

function nameOf(error: unknown): string {
  if (error && typeof error === "object") {
    const name = (error as ErrorLike).name;
    if (typeof name === "string") return name;
  }
  return "";
}

/**
 * True when the failure is the connection, not the request.
 *
 * Conservative on purpose: anything unrecognised is NOT a network failure, so
 * a refusal is never mistaken for an outage and silently retried forever.
 */
export function isNetworkFailure(error: unknown): boolean {
  if (error === null || error === undefined) return false;
  if (NETWORK_ERROR_NAMES.has(nameOf(error))) return true;
  const message = messageOf(error);
  if (!message) return false;
  return NETWORK_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}
