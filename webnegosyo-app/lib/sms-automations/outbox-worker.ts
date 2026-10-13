/**
 * Sends the store's AUTOMATED texts (review asks, win-backs, reward nudges)
 * from this phone's SIM: claim one → send → report. Pure; the runtime wires
 * the HTTP port, the SIM transport and the journal.
 *
 * The server decides who gets a text and re-checks consent, quiet hours,
 * pacing and the daily limit at claim time, and hands each text out ONCE. So
 * this worker never retries a text: a send that fails, or a crash between
 * "sent" and the report, is reported as failed and that text is done. A guest
 * missing one reminder is fine; a guest getting it twice is not.
 */

import type { LoyaltySmsTransport } from "../loyalty/sms-transport";
import type { SmsDeliveryJournal } from "../loyalty/sms-journal";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const E164 = /^\+[1-9]\d{6,14}$/;
const MAX_BODY_CHARS = 1000;

/** Leave room between automated texts: carriers flag bursts from one SIM. */
export const OUTBOX_SEND_GAP_MS = 15_000;
const IDLE_POLL_MS = 60_000;
const TROUBLE_BACKOFF_MS = 60_000;
const QUIET_POLL_MS = 10 * 60_000;
const MAX_WAIT_MS = 30 * 60_000;

export type OutboxRef = { messageId: string; leaseToken: string };
export type OutboxMessage = OutboxRef & { phone: string; body: string };
export type OutboxWaitReason = "no_job" | "quiet_hours" | "daily_limit" | "paced";
export type OutboxClaim =
  | { message: OutboxMessage; wait: null }
  | { message: null; wait: { reason: OutboxWaitReason; retryAt: string | null } };

export interface OutboxApi {
  claim(): Promise<OutboxClaim>;
  finish(ref: OutboxRef, outcome: "sent" | "failed", error?: string): Promise<boolean>;
}

export type OutboxRunResult =
  | { result: "sent" | "recovered" | "busy" | "unavailable" | "uncertain" | "recovery_required" }
  | { result: "waiting"; reason: OutboxWaitReason; retryAt: string | null };

interface Deps {
  api: OutboxApi;
  transport: LoyaltySmsTransport;
  journal: SmsDeliveryJournal;
  canSend(): boolean;
  now(): number;
}

function isSendable(message: OutboxMessage): boolean {
  return UUID.test(message.messageId) && UUID.test(message.leaseToken)
    && typeof message.phone === "string" && E164.test(message.phone)
    && typeof message.body === "string" && message.body.length > 0 && message.body.length <= MAX_BODY_CHARS;
}

export function createOutboxWorker({ api, transport, journal, canSend }: Deps) {
  let running = false;

  /** The journal row is the proof a report is owed; it is cleared only once the server took it. */
  async function report(ref: OutboxRef, outcome: "sent" | "failed", error?: string): Promise<boolean> {
    await journal.write({ jobId: ref.messageId, leaseToken: ref.leaseToken, outcome });
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (await api.finish(ref, outcome, error)) {
          await journal.clear();
          return true;
        }
        // Refused (a stale token): nothing more this phone can do about it.
        await journal.clear();
        return false;
      } catch {
        /* Retry the report only — never the text. */
      }
    }
    return false;
  }

  async function recover(): Promise<OutboxRunResult | null> {
    const pending = await journal.read();
    if (!pending) return null;
    const ref = { messageId: pending.jobId, leaseToken: pending.leaseToken };
    const outcome = pending.outcome === "sent" ? "sent" : "failed";
    const ok = await report(ref, outcome, outcome === "failed" ? "device_restarted" : undefined);
    return { result: ok || !(await journal.read()) ? "recovered" : "recovery_required" };
  }

  return {
    async runOnce(): Promise<OutboxRunResult> {
      if (running) return { result: "busy" };
      running = true;
      try {
        if (!transport.isAvailable || !canSend()) return { result: "unavailable" };
        const recovered = await recover();
        if (recovered) return recovered;
        if (!(await transport.prepare()) || !canSend()) return { result: "unavailable" };

        const claim = await api.claim();
        if (!claim.message) return { result: "waiting", reason: claim.wait.reason, retryAt: claim.wait.retryAt };
        const ref = { messageId: claim.message.messageId, leaseToken: claim.message.leaseToken };
        if (!isSendable(claim.message) || !canSend()) {
          await report(ref, "failed", isSendable(claim.message) ? "phone_stopped" : "invalid_message");
          return { result: "unavailable" };
        }

        await journal.write({ jobId: ref.messageId, leaseToken: ref.leaseToken, outcome: "pending" });
        try {
          await transport.send(claim.message.phone, claim.message.body, canSend);
        } catch {
          await report(ref, "failed", "send_failed");
          return { result: "uncertain" };
        }
        await report(ref, "sent");
        return { result: "sent" };
      } catch {
        return { result: "unavailable" };
      } finally {
        running = false;
      }
    },
  };
}

/** When this phone should ask for its next automated text. */
export function nextOutboxAttemptAt(outcome: OutboxRunResult, now: number): number {
  const clamp = (at: number) => Math.min(now + MAX_WAIT_MS, Math.max(now + OUTBOX_SEND_GAP_MS, at));
  switch (outcome.result) {
    case "sent":
    case "recovered":
    case "busy":
      return now + OUTBOX_SEND_GAP_MS;
    case "waiting": {
      const retry = outcome.retryAt ? Date.parse(outcome.retryAt) : NaN;
      if (Number.isFinite(retry)) return clamp(retry);
      if (outcome.reason === "quiet_hours") return now + QUIET_POLL_MS;
      return now + IDLE_POLL_MS;
    }
    default:
      return now + TROUBLE_BACKOFF_MS;
  }
}
