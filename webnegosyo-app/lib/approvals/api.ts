/**
 * The app's client for /api/approvals/** on the web app.
 *
 * Same discipline as authorized-post / loyalty repo: the session read AND the
 * request sit inside one deadline (a stalled token refresh holds the auth
 * lock, and an unbounded getSession() is how the register froze), the bearer
 * is the signed-in person's own access token, and nothing here throws — every
 * call resolves to { ok, status, ... } so a screen always gets an answer.
 *
 * Built from injected deps so the logic is testable in node; the default
 * wiring loads the RN-dependent modules lazily.
 */
import type {
  ApprovalRequestView,
  ApprovalRules,
  CreateApprovalInput,
  CreateApprovalResult,
} from "./types";

export const APPROVALS_TIMEOUT_MS = 12_000;

export interface ApprovalsApiDeps {
  getToken: (timeoutMs: number) => Promise<string | null>;
  baseUrl: () => string | Promise<string>;
  fetchImpl: (input: string, init: RequestInit) => Promise<Response>;
  timeoutMs?: number;
}

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; code?: string; data?: Record<string, unknown> | null };

/** status 0 = never reached the server (offline, timeout). */
export const OFFLINE_MESSAGE = "You're offline. Requests need internet so they're never sent twice.";

interface Envelope {
  success?: boolean;
  data?: unknown;
  error?: string | null;
  code?: string;
}

function fail(status: number, error: string, code?: string, data?: Record<string, unknown> | null): ApiResult<never> {
  return { ok: false, status, error, ...(code ? { code } : {}), ...(data !== undefined ? { data } : {}) };
}

async function call<T>(
  deps: ApprovalsApiDeps,
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const timeoutMs = deps.timeoutMs ?? APPROVALS_TIMEOUT_MS;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("timeout"));
    }, timeoutMs);
  });

  try {
    const token = await Promise.race([deps.getToken(timeoutMs), expiry]);
    if (!token) return fail(401, "Sign in again.", "unauthorized");
    const baseUrl = await deps.baseUrl();

    const response = await Promise.race([
      deps.fetchImpl(`${baseUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
      expiry,
    ]);
    const envelope = (await Promise.race([response.json().catch(() => null), expiry])) as Envelope | null;
    if (response.ok && envelope?.success) return { ok: true, status: response.status, data: envelope.data as T };
    return fail(
      response.status,
      envelope?.error ?? "Couldn't send the request. Nothing was sent. Try again.",
      envelope?.code,
      (envelope?.data as Record<string, unknown> | null | undefined) ?? null,
    );
  } catch {
    return fail(0, OFFLINE_MESSAGE, "offline");
  } finally {
    clearTimeout(timer);
  }
}

const q = (value: string) => encodeURIComponent(value);

export type ApprovalListFilter = "pending" | "mine" | "recent";

export interface ApprovalsApi {
  list(tenantId: string, status: ApprovalListFilter): Promise<ApiResult<{ requests: ApprovalRequestView[]; isApprover: boolean }>>;
  get(tenantId: string, id: string): Promise<ApiResult<{ request: ApprovalRequestView }>>;
  create(tenantId: string, input: CreateApprovalInput): Promise<ApiResult<CreateApprovalResult>>;
  decide(
    tenantId: string,
    id: string,
    decision: { decision: "approve" | "decline"; reasonCode?: string; note?: string; amountOverride?: number; source?: "app" | "push" },
  ): Promise<ApiResult<{ request: ApprovalRequestView }>>;
  withdraw(tenantId: string, id: string): Promise<ApiResult<{ request: ApprovalRequestView }>>;
  getRules(tenantId: string): Promise<ApiResult<{ rules: ApprovalRules; approvers: { userId: string; name: string | null; outletId: string | null }[]; canEdit: boolean }>>;
  saveRules(tenantId: string, changes: Partial<Omit<ApprovalRules, "updatedAt" | "updatedByName">>): Promise<ApiResult<{ rules: ApprovalRules }>>;
}

export function createApprovalsApi(deps: ApprovalsApiDeps): ApprovalsApi {
  return {
    list: (tenantId, status) => call(deps, "GET", `/api/approvals?tenantId=${q(tenantId)}&status=${q(status)}`),
    get: (tenantId, id) => call(deps, "GET", `/api/approvals/${q(id)}?tenantId=${q(tenantId)}`),
    create: (tenantId, input) => call(deps, "POST", "/api/approvals", { tenantId, ...input }),
    decide: (tenantId, id, decision) => call(deps, "POST", `/api/approvals/${q(id)}/decision`, { tenantId, ...decision }),
    withdraw: (tenantId, id) => call(deps, "POST", `/api/approvals/${q(id)}/withdraw`, { tenantId }),
    getRules: (tenantId) => call(deps, "GET", `/api/approvals/rules?tenantId=${q(tenantId)}`),
    saveRules: (tenantId, changes) => call(deps, "PUT", "/api/approvals/rules", { tenantId, ...changes }),
  };
}

/** One retry key per open request sheet: a double tap files one request. */
export function newIdempotencyKey(random: () => number = Math.random, now: () => number = Date.now): string {
  const part = () => Math.floor(random() * 0x100000000).toString(36).padStart(7, "0");
  return `sheet_${now().toString(36)}_${part()}${part()}`;
}

/** The production client. RN modules are loaded on first use, not at import. */
export const approvalsApi: ApprovalsApi = createApprovalsApi({
  getToken: async (timeoutMs) => {
    const { getAccessTokenBounded } = await import("../authorized-post");
    return getAccessTokenBounded(timeoutMs);
  },
  baseUrl: async () => {
    const { getWebAppUrl } = await import("../web-app-url");
    return getWebAppUrl();
  },
  fetchImpl: (input, init) => fetch(input, init),
});
