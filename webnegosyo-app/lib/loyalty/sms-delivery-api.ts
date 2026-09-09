/**
 * The enrolled handset's bounded transport to the web app's loyalty SMS
 * delivery routes, shaped as the port `sms-worker.ts` expects.
 *
 * Built the same way as `manage-staff-transport.ts`: a deadline on the session
 * read (GoTrue serialises readers behind a stalled refresh), a deadline on the
 * request, and no retries here — the worker decides what may be retried.
 * Every call re-presents the device credential; the server hashes it and SQL
 * re-checks the registry, so nothing is trusted from a cached authorization.
 */

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export const LOYALTY_SMS_SESSION_TIMEOUT_MS = 8_000;
export const LOYALTY_SMS_REQUEST_TIMEOUT_MS = 10_000;

export type DeliveryTransportDeps = {
  webAppUrl: string;
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>;
  getSession: () => Promise<{ data: { session: { access_token: string } | null } }>;
  sessionTimeoutMs?: number;
  requestTimeoutMs?: number;
};

type DeviceIdentity = { tenantId: string; device: { deviceId: string; credential: string } };
type JobReference = { jobId: string; leaseToken: string };
type Lease = JobReference & { leaseExpiresAt: string };
type Grant = JobReference & { phone: string; code: string; expiresAt: string };
type Outcome = "sent" | "failed";
type EnrollResult =
  | { ok: true; device: { deviceId: string; credential: string } }
  | { ok: false; error: string };

/** The server answered 403: the registry no longer accepts this device. */
export class DeviceRevokedError extends Error {
  constructor() {
    super("This device is no longer enrolled for loyalty SMS delivery.");
    this.name = "DeviceRevokedError";
  }
}

function deadline(ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  return { promise, cancel: () => clearTimeout(timer) };
}

async function send(
  deps: DeliveryTransportDeps,
  method: "POST" | "DELETE",
  path: string,
  body: Record<string, unknown>,
): Promise<{ status: number; json: unknown }> {
  const session = deadline(deps.sessionTimeoutMs ?? LOYALTY_SMS_SESSION_TIMEOUT_MS);
  let token: string | undefined;
  try {
    const { data } = await Promise.race([deps.getSession(), session.promise]);
    token = data.session?.access_token;
  } finally {
    session.cancel();
  }
  if (!token) throw new Error("You are signed out. Sign in again and retry.");
  const request = deadline(deps.requestTimeoutMs ?? LOYALTY_SMS_REQUEST_TIMEOUT_MS);
  const controller = new AbortController();
  try {
    const response = await Promise.race([
      deps.fetchImpl(`${deps.webAppUrl.replace(/\/+$/, "")}${path}`, {
        method,
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }),
      request.promise.catch((error) => {
        controller.abort();
        throw error;
      }),
    ]);
    const text = await Promise.race([response.text(), request.promise]);
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: response.status, json };
  } finally {
    request.cancel();
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
const isInstant = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

function parseLease(value: unknown): Lease {
  if (!isRecord(value) || !isUuid(value.jobId) || !isUuid(value.leaseToken) || !isInstant(value.leaseExpiresAt)) {
    throw new Error("Malformed lease");
  }
  return { jobId: value.jobId, leaseToken: value.leaseToken, leaseExpiresAt: value.leaseExpiresAt };
}

function parseGrant(value: unknown): Grant {
  if (
    !isRecord(value) || !isUuid(value.jobId) || !isUuid(value.leaseToken) ||
    typeof value.phone !== "string" || typeof value.code !== "string" || !isInstant(value.expiresAt)
  ) {
    throw new Error("Malformed grant");
  }
  const { jobId, leaseToken, phone, code, expiresAt } = value;
  return { jobId, leaseToken, phone, code, expiresAt };
}

function expectOk(status: number, onRevoked?: () => void): void {
  if (status === 403) {
    onRevoked?.();
    throw new DeviceRevokedError();
  }
  if (status < 200 || status >= 300) throw new Error(`Delivery route answered ${status}`);
}

type DeliveryHooks = {
  /** Fired before the revocation error is thrown, since the worker swallows
   *  port errors into "unavailable" and the host must still learn to stop. */
  onRevoked?: () => void;
};

export function createLoyaltySmsDeliveryApi(
  deps: DeliveryTransportDeps,
  identity: DeviceIdentity,
  hooks: DeliveryHooks = {},
) {
  const base = {
    tenantId: identity.tenantId,
    deviceId: identity.device.deviceId,
    credential: identity.device.credential,
  };
  const post = (action: string, body: Record<string, unknown>) =>
    send(deps, "POST", `/api/loyalty/sms-delivery/${action}`, { ...base, ...body });
  async function acknowledge(action: "finish" | "recover", job: JobReference, outcome: Outcome) {
    const { status, json } = await post(action, { jobId: job.jobId, leaseToken: job.leaseToken, outcome });
    expectOk(status, hooks.onRevoked);
    return isRecord(json) && json.applied === true;
  }
  return {
    async claim(): Promise<Lease | null> {
      const { status, json } = await post("claim", {});
      expectOk(status, hooks.onRevoked);
      if (!isRecord(json) || !("job" in json)) throw new Error("Malformed claim response");
      return json.job === null ? null : parseLease(json.job);
    },
    async authorize(job: JobReference): Promise<Grant | null> {
      const { status, json } = await post("authorize", { jobId: job.jobId, leaseToken: job.leaseToken });
      expectOk(status, hooks.onRevoked);
      if (!isRecord(json) || !("grant" in json)) throw new Error("Malformed authorize response");
      return json.grant === null ? null : parseGrant(json.grant);
    },
    finish: (job: JobReference, outcome: Outcome) => acknowledge("finish", job, outcome),
    recover: (job: JobReference, outcome: Outcome) => acknowledge("recover", job, outcome),
  };
}

const ENROLL_MESSAGES = {
  outage: "Could not reach the server. Check your connection and try again.",
  malformed: "The server answered unexpectedly. Try again.",
} as const;

/** Owner action. The credential in the result is shown to this process once. */
export async function enrollLoyaltySmsDevice(deps: DeliveryTransportDeps, tenantId: string): Promise<EnrollResult> {
  try {
    const { status, json } = await send(deps, "POST", "/api/loyalty/sms-devices", { tenantId });
    if (status === 200 && isRecord(json) && isRecord(json.device)) {
      const { deviceId, credential } = json.device;
      if (isUuid(deviceId) && typeof credential === "string" && /^[A-Za-z0-9_-]{43}$/.test(credential)) {
        return { ok: true, device: { deviceId, credential } };
      }
      return { ok: false, error: ENROLL_MESSAGES.malformed };
    }
    const message = isRecord(json) && typeof json.error === "string" ? json.error : null;
    return { ok: false, error: status >= 500 || !message ? ENROLL_MESSAGES.outage : message };
  } catch (error) {
    return { ok: false, error: error instanceof Error && error.message !== "timeout" ? error.message : ENROLL_MESSAGES.outage };
  }
}

export async function revokeLoyaltySmsDevice(
  deps: DeliveryTransportDeps, tenantId: string, deviceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { status, json } = await send(deps, "DELETE", "/api/loyalty/sms-devices", { tenantId, deviceId });
    if (status === 200) return { ok: true };
    const message = isRecord(json) && typeof json.error === "string" ? json.error : null;
    return { ok: false, error: status >= 500 || !message ? ENROLL_MESSAGES.outage : message };
  } catch (error) {
    return { ok: false, error: error instanceof Error && error.message !== "timeout" ? error.message : ENROLL_MESSAGES.outage };
  }
}

export type LoyaltySmsDeliveryApi = ReturnType<typeof createLoyaltySmsDeliveryApi>;
