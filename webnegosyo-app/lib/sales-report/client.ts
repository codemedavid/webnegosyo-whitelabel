/**
 * Reads a report from the web's `POST /api/reports/query`, as the signed-in
 * user (Bearer). Never hangs: the token read and the request share one
 * deadline (see `authorized-post.ts` for why `getSession()` alone can stall).
 * Never throws: every outcome is a result the screen can say out loud.
 */

import { getAccessTokenBounded } from "../authorized-post";
import { getWebAppUrl } from "../web-app-url";
import type { ReportPayload, ReportQuery } from "./types";

const REPORT_PATH = "/api/reports/query";
/** A year of months is a dozen reads on the server; give it room, not forever. */
export const REPORT_TIMEOUT_MS = 25_000;
const TOKEN_TIMEOUT_MS = 5_000;

export type ReportFetchFailure = "signed_out" | "forbidden" | "unsupported" | "rate_limited" | "unavailable";

export type ReportFetchResult =
  | { ok: true; payload: ReportPayload }
  | { ok: false; reason: ReportFetchFailure; message: string };

const MESSAGES: Readonly<Record<ReportFetchFailure, string>> = {
  signed_out: "Sign in again to see your reports.",
  forbidden: "You need the Reports permission to see this. Ask the store owner.",
  unsupported: "These reports are for stores on the WebNegosyo order system.",
  rate_limited: "Too many report requests. Give it a moment.",
  unavailable: "Reports couldn’t load. Check your connection and try again.",
};

function failure(reason: ReportFetchFailure, message?: string): ReportFetchResult {
  return { ok: false, reason, message: message ?? MESSAGES[reason] };
}

function reasonFor(status: number): ReportFetchFailure {
  if (status === 401) return "signed_out";
  if (status === 403) return "forbidden";
  if (status === 409) return "unsupported";
  if (status === 429) return "rate_limited";
  return "unavailable";
}

function isPayload(body: unknown): body is ReportPayload & { success: true } {
  if (!body || typeof body !== "object") return false;
  const candidate = body as Partial<ReportPayload> & { success?: unknown };
  return candidate.success === true && !!candidate.context && Array.isArray(candidate.metrics) && !!candidate.sections;
}

export async function fetchReport(query: ReportQuery, fetchImpl: typeof fetch = fetch): Promise<ReportFetchResult> {
  const token = await getAccessTokenBounded(TOKEN_TIMEOUT_MS);
  if (!token) return failure("signed_out");

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve("timeout");
    }, REPORT_TIMEOUT_MS);
  });

  try {
    const response = await Promise.race([
      fetchImpl(`${getWebAppUrl()}${REPORT_PATH}`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(query),
      }),
      expiry,
    ]);
    if (response === "timeout") return failure("unavailable");
    const body: unknown = await Promise.race([response.json().catch(() => null), expiry]);
    if (!response.ok) {
      const serverMessage = body && typeof body === "object" ? (body as { error?: unknown }).error : undefined;
      const reason = reasonFor(response.status);
      // The server's own sentence for refusals is written for staff; anything else stays generic.
      return failure(reason, reason === "forbidden" && typeof serverMessage === "string" ? serverMessage : undefined);
    }
    return isPayload(body) ? { ok: true, payload: body } : failure("unavailable");
  } catch {
    return failure("unavailable");
  } finally {
    clearTimeout(timer);
  }
}
