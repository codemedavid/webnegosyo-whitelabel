/**
 * The "use this phone as an SMS gateway" mode, minus everything native.
 *
 * When the merchant switches it on, an Android foreground service keeps the
 * app process alive (screen off, app closed, after a reboot) and hosts a
 * headless JS task that runs the SAME delivery worker the app always had
 * (`sms-worker.ts`): claim → authorize → send from the SIM → acknowledge.
 * This module is the pure part of that loop, so its rules are testable here.
 */

import { nextPollDelayMs, type WorkerRunResult } from "./sms-delivery-mount";

/**
 * Why the gateway loop ended. Every reason stops the foreground service except
 * `superseded`: a newer run (the merchant toggled off and on) owns it now.
 */
export type GatewayStopReason = "stopped" | "revoked" | "signed_out" | "disabled" | "superseded";

export interface GatewayLoopDeps {
  runOnce(): Promise<WorkerRunResult>;
  /** Null to keep going; a reason to stop. Checked before and after each poll. */
  check(): Promise<GatewayStopReason | null>;
  sleep(ms: number): Promise<void>;
  onResult?(result: WorkerRunResult): void;
}

export async function runGatewayLoop({ runOnce, check, sleep, onResult }: GatewayLoopDeps): Promise<GatewayStopReason> {
  for (;;) {
    const before = await check();
    if (before) return before;
    let result: WorkerRunResult;
    try {
      result = await runOnce();
    } catch {
      result = "unavailable";
    }
    onResult?.(result);
    const after = await check();
    if (after) return after;
    await sleep(nextPollDelayMs(result));
  }
}

export interface GatewayStats {
  sentToday: number;
  lastSentAt: number | null;
}

function clockTime(at: number): string {
  const date = new Date(at);
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${hours < 12 ? "AM" : "PM"}`;
}

/** Text of the persistent "SMS gateway is on" notification. */
export function gatewayStatusText({ sentToday, lastSentAt }: GatewayStats): string {
  if (sentToday === 0 || lastSentAt === null) return "Ready to send reward codes";
  const noun = sentToday === 1 ? "code" : "codes";
  return `${sentToday} ${noun} sent today · last at ${clockTime(lastSentAt)}`;
}

export type GatewayEnableStep = "unsupported" | "update_app" | "enroll" | "sms_permission" | "ready";

export interface GatewayEnableConditions {
  platform: string;
  releaseEnabled: boolean;
  /** The installed binary ships the foreground service. */
  hasNativeGateway: boolean;
  isEnrolled: boolean;
  hasSmsPermission: boolean;
}

/** The first thing standing between the merchant and a running gateway. */
export function planGatewayEnable(conditions: GatewayEnableConditions): GatewayEnableStep {
  if (conditions.platform !== "android" || !conditions.releaseEnabled) return "unsupported";
  if (!conditions.hasNativeGateway) return "update_app";
  if (!conditions.isEnrolled) return "enroll";
  if (!conditions.hasSmsPermission) return "sms_permission";
  return "ready";
}

export interface SmsGatewayNative {
  startSmsGateway(config: { tenantId: string; actorId: string }): Promise<void>;
  stopSmsGateway(): Promise<void>;
  getSmsGatewayState(): Promise<{ enabled: boolean; running: boolean }>;
  setSmsGatewayStatus(text: string): void;
  isIgnoringBatteryOptimizations(): Promise<boolean>;
  requestIgnoreBatteryOptimizations(): Promise<void>;
}

const GATEWAY_FUNCTIONS: readonly (keyof SmsGatewayNative)[] = [
  "startSmsGateway",
  "stopSmsGateway",
  "getSmsGatewayState",
  "setSmsGatewayStatus",
  "isIgnoringBatteryOptimizations",
  "requestIgnoreBatteryOptimizations",
];

/**
 * The gateway half of the native module, or null. An APK built before the
 * gateway shipped still has `sendSms` but none of these, and must read as
 * "update the app", never crash on a missing function.
 */
export function resolveGatewayNative(module: unknown): SmsGatewayNative | null {
  if (!module || typeof module !== "object") return null;
  const candidate = module as Record<string, unknown>;
  return GATEWAY_FUNCTIONS.every((name) => typeof candidate[name] === "function")
    ? (module as SmsGatewayNative)
    : null;
}

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export interface GatewayTaskConfig {
  tenantId: string;
  actorId: string;
}

/** The service hands the task what it was started with; trust nothing else. */
export function parseGatewayTaskData(data: unknown): GatewayTaskConfig | null {
  if (!data || typeof data !== "object") return null;
  const { tenantId, actorId } = data as Record<string, unknown>;
  if (typeof tenantId !== "string" || !UUID.test(tenantId)) return null;
  if (typeof actorId !== "string" || !UUID.test(actorId)) return null;
  return { tenantId, actorId };
}
