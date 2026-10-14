/**
 * The HTTP status the web app answered a `postAuthorized` call with, looked up
 * by the request body object that was sent.
 *
 * `postAuthorized` answers a plain boolean — every caller behind a completed
 * sale only needs "did it land". The stock notifier needs one more fact: was a
 * refusal PERMANENT (400/401/403/409 — retrying says no again) or transient
 * (5xx, a timeout, no session — retry later)? Rather than widening the shared
 * call's signature for one caller, the post records the status here, keyed by
 * the body it sent, and the notifier reads it back.
 *
 * A WeakMap, so a recorded status lives exactly as long as the body object and
 * nothing accumulates. A body that never reached a server has no entry (null).
 */

const statuses = new WeakMap<object, number>();

export function recordResponseStatus(body: unknown, status: unknown): void {
  if (!body || typeof body !== "object") return;
  if (typeof status !== "number" || !Number.isFinite(status)) return;
  statuses.set(body, status);
}

/** The status the server answered `body` with, or null when none answered. */
export function responseStatusOf(body: object): number | null {
  return statuses.get(body) ?? null;
}
