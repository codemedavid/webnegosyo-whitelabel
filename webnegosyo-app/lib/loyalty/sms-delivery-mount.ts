/**
 * How often the SMS gateway polls for reward codes to send.
 *
 * Pure so the cadence is testable. The server and SQL enforce the real
 * boundary (registry, live mode, permissions, leases) on every call.
 */

export type WorkerRunResult =
  | "sent"
  | "idle"
  | "busy"
  | "unavailable"
  | "uncertain"
  | "sent_unconfirmed"
  | "recovered"
  | "recovery_required";

/** OTPs live five minutes; a queued code should leave within seconds. */
export const LOYALTY_SMS_POLL_ACTIVE_MS = 5_000;
/** After a failure, give the network or session time to recover. */
export const LOYALTY_SMS_POLL_BACKOFF_MS = 30_000;

export function nextPollDelayMs(result: WorkerRunResult): number {
  switch (result) {
    case "sent":
    case "idle":
    case "busy":
    case "recovered":
      return LOYALTY_SMS_POLL_ACTIVE_MS;
    default:
      return LOYALTY_SMS_POLL_BACKOFF_MS;
  }
}
