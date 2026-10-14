/**
 * The enrolled phone's HTTP port for automated texts
 * (`POST /api/sms/outbox/{claim,finish}`), shaped as `outbox-worker.ts`
 * expects. Same session/request deadlines and device credential as the
 * reward-code port; a 403 means the server no longer accepts this phone.
 */

import { DeviceRevokedError, send, type DeliveryTransportDeps } from "../loyalty/sms-delivery-api";
import type { OutboxApi, OutboxClaim, OutboxWaitReason } from "./outbox-worker";
import { PHONE_INFO_HEADER, createPhoneInfoReporter, type PhoneInfoReporter } from "./phone-info";

type DeviceIdentity = { tenantId: string; device: { deviceId: string; credential: string } };

const WAIT_REASONS: ReadonlySet<string> = new Set(["no_job", "quiet_hours", "daily_limit", "paced"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function parseClaim(json: unknown): OutboxClaim {
  if (!isRecord(json)) throw new Error("Malformed outbox claim");
  const { message, wait } = json;
  if (isRecord(message)) {
    const { messageId, leaseToken, phone, body } = message;
    if (typeof messageId === "string" && typeof leaseToken === "string" && typeof phone === "string" && typeof body === "string") {
      return { message: { messageId, leaseToken, phone, body }, wait: null };
    }
    throw new Error("Malformed outbox message");
  }
  if (isRecord(wait) && typeof wait.reason === "string" && WAIT_REASONS.has(wait.reason)) {
    const retryAt = typeof wait.retryAt === "string" ? wait.retryAt : null;
    return { message: null, wait: { reason: wait.reason as OutboxWaitReason, retryAt } };
  }
  throw new Error("Malformed outbox claim");
}

/** The real device's report; null when it cannot even be assembled (never fatal). */
function deviceReporter(): PhoneInfoReporter | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- device reads load native modules; only when a worker is built
    const device = require("./phone-info-device") as typeof import("./phone-info-device");
    return createPhoneInfoReporter({ collect: device.collectPhoneInfo, appVersion: device.readAppVersion, now: () => Date.now() });
  } catch {
    return null;
  }
}

async function nextReport(reporter: PhoneInfoReporter | null): Promise<string | null> {
  try {
    return reporter ? await reporter.next() : null;
  } catch {
    return null;
  }
}

type OutboxHooks = {
  onRevoked?: () => void;
  /** Who builds the `x-wn-phone-info` header. Omitted = this device; null = none (tests). */
  phoneInfo?: PhoneInfoReporter | null;
};

export function createOutboxApi(
  deps: DeliveryTransportDeps,
  identity: DeviceIdentity,
  hooks: OutboxHooks = {},
): OutboxApi {
  const base = { tenantId: identity.tenantId, deviceId: identity.device.deviceId, credential: identity.device.credential };
  const reporter = hooks.phoneInfo === undefined ? deviceReporter() : hooks.phoneInfo;
  const post = async (action: "claim" | "finish", body: Record<string, unknown>, headers?: Record<string, string>) => {
    const { status, json } = await send(deps, "POST", `/api/sms/outbox/${action}`, { ...base, ...body }, headers);
    if (status === 403) {
      hooks.onRevoked?.();
      throw new DeviceRevokedError();
    }
    if (status < 200 || status >= 300) throw new Error(`Outbox route answered ${status}`);
    return json;
  };
  return {
    async claim() {
      const report = await nextReport(reporter);
      const json = await post("claim", {}, report ? { [PHONE_INFO_HEADER]: report } : undefined);
      if (report) reporter?.sent();
      return parseClaim(json);
    },
    async finish(ref, outcome, error) {
      const json = await post("finish", {
        messageId: ref.messageId, leaseToken: ref.leaseToken, outcome, ...(error ? { error } : {}),
      });
      return isRecord(json) && json.applied === true;
    },
  };
}
