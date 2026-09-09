/**
 * When the foreground OTP delivery worker may run, and how often it polls.
 *
 * Pure so the gate is testable without React. Every condition here is a
 * convenience for the handset; the server and SQL enforce the real boundary
 * (registry, live mode, permissions, leases) on every call regardless.
 */

export type MountConditions = {
  platform: string;
  releaseEnabled: boolean;
  loyaltyEnabled: boolean;
  isDemo: boolean;
  isImpersonating: boolean;
  hasEnrollment: boolean;
  appState: string;
};

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

export function shouldRunLoyaltySmsDelivery(conditions: MountConditions): boolean {
  return (
    conditions.platform === "android" &&
    conditions.releaseEnabled &&
    conditions.loyaltyEnabled &&
    !conditions.isDemo &&
    !conditions.isImpersonating &&
    conditions.hasEnrollment &&
    conditions.appState === "active"
  );
}

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
