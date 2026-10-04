/**
 * The headless task the Android SMS gateway service runs.
 *
 * It may start with no UI at all (after a reboot, or with the app swiped
 * away), so it reads nothing from the auth store: the service passes the
 * tenant and actor it was started for, the credential comes from the keystore,
 * and the signed-in user comes from the persisted Supabase session. Every
 * dependency is injected so the stop rules are testable; `sms-gateway-runtime`
 * wires the real ones.
 *
 * The server stays the boundary (live loyalty, permissions, leases are
 * re-checked on every call). These checks only decide when THIS phone should
 * stop asking.
 */

import type { DeviceEnrollment } from "./device-credential-store";
import type { WorkerRunResult } from "./sms-delivery-mount";
import {
  gatewayStatusText,
  parseGatewayTaskData,
  runGatewayLoop,
  type GatewayStopReason,
  type GatewayTaskConfig,
} from "./sms-gateway";

export const LOYALTY_SMS_GATEWAY_TASK = "LoyaltySmsGateway";
/** Shown in the gateway notification once polls keep failing. */
export const GATEWAY_TROUBLE_TEXT = "Having trouble sending codes — check signal, load and internet";
/** Consecutive failed polls before the notification says so (~1 minute at backoff). */
const TROUBLE_AFTER_FAILURES = 3;
const FAILED_RESULTS: ReadonlySet<WorkerRunResult> = new Set(["unavailable", "uncertain", "sent_unconfirmed", "recovery_required"]);

export interface GatewayTaskDeps {
  readEnrollment(scope: GatewayTaskConfig): Promise<DeviceEnrollment | null>;
  clearEnrollment(scope: GatewayTaskConfig, enrollment: DeviceEnrollment): Promise<void>;
  /** The persisted session's user; null = signed out. Throws when unreadable. */
  currentUserId(): Promise<string | null>;
  isReleaseEnabled(): boolean;
  /** The merchant's switch, kept natively so a reboot can honour it. */
  isGatewayEnabled(): Promise<boolean>;
  createWorker(
    scope: GatewayTaskConfig,
    enrollment: DeviceEnrollment,
    canSend: () => boolean,
    onRevoked: () => void,
  ): { runOnce(): Promise<WorkerRunResult> };
  sleep(ms: number): Promise<void>;
  setStatus(text: string): void;
  stopService(): Promise<void>;
  now(): number;
}

export function createGatewayTask(deps: GatewayTaskDeps) {
  // One phone, one sender: a restarted service starts a new run and every
  // older loop stands down at its next check without touching the service.
  let currentRun = 0;
  // Polls from every run go through one chain: a superseding run waits for the
  // old run's in-flight poll to settle, so two workers never share the device
  // journal at once.
  let pollChain: Promise<unknown> = Promise.resolve();
  const serialized = (poll: () => Promise<WorkerRunResult>): Promise<WorkerRunResult> => {
    const next = pollChain.then(poll, poll);
    pollChain = next.catch(() => undefined);
    return next;
  };
  return async function loyaltySmsGatewayTask(data: unknown): Promise<GatewayStopReason> {
    const run = ++currentRun;
    const isCurrent = () => run === currentRun;
    const config = parseGatewayTaskData(data);
    const enrollment = config ? await deps.readEnrollment(config).catch(() => null) : null;
    if (!config || !enrollment) {
      if (isCurrent()) await deps.stopService().catch(() => undefined);
      return "stopped";
    }
    let isActive = true;
    let isRevoked = false;
    // Last known session owner. An unreadable session (offline, slow refresh)
    // keeps the previous answer; only a readable "someone else / nobody" stops.
    let isSessionOwner = true;
    const stats = { sentToday: 0, lastSentAt: null as number | null, day: new Date(deps.now()).toDateString() };

    const canSend = () => isActive && isCurrent() && !isRevoked && isSessionOwner && deps.isReleaseEnabled();
    const check = async (): Promise<GatewayStopReason | null> => {
      if (!isCurrent()) return "superseded";
      if (isRevoked) return "revoked";
      if (!deps.isReleaseEnabled()) return "disabled";
      try {
        const userId = await deps.currentUserId();
        isSessionOwner = userId === config.actorId;
      } catch {
        // Keep the last known answer.
      }
      if (!isSessionOwner) return "signed_out";
      if (!(await deps.isGatewayEnabled().catch(() => true))) return "stopped";
      return null;
    };
    let failures = 0;
    let shownText = "";
    const show = (text: string) => {
      if (text === shownText) return;
      shownText = text;
      deps.setStatus(text);
    };
    const record = (result: WorkerRunResult) => {
      failures = FAILED_RESULTS.has(result) ? failures + 1 : 0;
      if (result === "sent") {
        const today = new Date(deps.now()).toDateString();
        if (today !== stats.day) Object.assign(stats, { sentToday: 0, day: today });
        stats.sentToday += 1;
        stats.lastSentAt = deps.now();
      }
      show(failures >= TROUBLE_AFTER_FAILURES ? GATEWAY_TROUBLE_TEXT : gatewayStatusText(stats));
    };

    const worker = deps.createWorker(config, enrollment, canSend, () => {
      isRevoked = true;
    });
    show(gatewayStatusText(stats));
    const reason = await runGatewayLoop({
      runOnce: () => serialized(() => (isCurrent() ? worker.runOnce() : Promise.resolve("idle" as const))),
      check,
      sleep: deps.sleep,
      onResult: record,
    });
    isActive = false;
    if (reason === "superseded") return reason;
    if (reason === "revoked") await deps.clearEnrollment(config, enrollment).catch(() => undefined);
    await deps.stopService().catch(() => undefined);
    return reason;
  };
}
