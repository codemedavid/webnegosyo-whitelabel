/**
 * Rewards screen ↔ platform. Surfaces failure like `customer-hub/repo.ts`:
 * this is the screen's whole content, so a swallowed error would draw "no
 * programs" where the truth is "could not reach the platform".
 *
 * Aborted AND raced, session read inside the deadline — the fetch discipline
 * `voucher-service.ts` documents.
 */

import { supabase } from "../supabase";
import { getWebAppUrl } from "../web-app-url";
import type { LoyaltyFlags, LoyaltyProgramSummary, LoyaltyRules } from "./programs";

const PROGRAMS_PATH = "/api/loyalty/programs";
const TIMEOUT_MS = 15_000;

export type ProgramsResult =
  | { ok: true; programs: LoyaltyProgramSummary[]; flags: LoyaltyFlags }
  | { ok: false; reason: "forbidden" | "unavailable" };

export type ProgramWriteResult = { ok: true } | { ok: false; error: string };

async function call(
  method: "GET" | "POST",
  input: { tenantId: string; query?: string; body?: Record<string, unknown> },
): Promise<{ status: number; body: Record<string, unknown> | null } | { status: 0; body: null }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("timeout"));
    }, TIMEOUT_MS);
  });

  try {
    const { data } = await Promise.race([supabase.auth.getSession(), expiry]);
    const token = data.session?.access_token;
    if (!token) return { status: 401, body: null };

    const url = `${getWebAppUrl()}${PROGRAMS_PATH}${input.query ?? ""}`;
    const response = await Promise.race([
      fetch(url, {
        signal: controller.signal,
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: method === "POST" ? JSON.stringify({ tenantId: input.tenantId, ...(input.body ?? {}) }) : undefined,
      }),
      expiry,
    ]);
    const body = (await Promise.race([response.json().catch(() => null), expiry])) as Record<string, unknown> | null;
    return { status: response.status, body };
  } catch {
    return { status: 0, body: null };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchLoyaltyPrograms(tenantId: string): Promise<ProgramsResult> {
  const result = await call("GET", { tenantId, query: `?tenantId=${encodeURIComponent(tenantId)}` });
  if (result.status === 401 || result.status === 403) return { ok: false, reason: "forbidden" };
  if (result.status !== 200 || !result.body || !Array.isArray(result.body.programs)) {
    return { ok: false, reason: "unavailable" };
  }
  const flags = (result.body.loyalty ?? {}) as Partial<LoyaltyFlags>;
  return {
    ok: true,
    programs: result.body.programs as LoyaltyProgramSummary[],
    // Unknown reads as shadow: a flag we could not read must not look live.
    flags: { isEnabled: flags.isEnabled === true, isShadow: flags.isShadow !== false },
  };
}

async function write(tenantId: string, body: Record<string, unknown>): Promise<ProgramWriteResult> {
  const result = await call("POST", { tenantId, body });
  if (result.status === 200) return { ok: true };
  const error = typeof result.body?.error === "string" ? result.body.error : "Could not reach the platform.";
  return { ok: false, error };
}

export function createLoyaltyProgram(
  tenantId: string,
  program: { name: string; scope: "business"; rules: LoyaltyRules },
): Promise<ProgramWriteResult> {
  return write(tenantId, { action: "create", program });
}

export function setLoyaltyProgramStatus(
  tenantId: string,
  programId: string,
  status: "active" | "paused" | "ended",
): Promise<ProgramWriteResult> {
  return write(tenantId, { action: "set_status", programId, status });
}
