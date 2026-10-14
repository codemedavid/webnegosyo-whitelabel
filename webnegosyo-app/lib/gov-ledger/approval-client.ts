/**
 * The register's calls for manager approval of a large Senior/PWD discount:
 * who may approve here, and "this manager typed this PIN — approve?".
 *
 * Bounded like every other post-sale call (a stalled token refresh must never
 * freeze the register in front of a customer). An unreachable server is its
 * own answer (`offline`), because the register then lets the sale through and
 * flags it for the owner instead of blocking a discount the law requires.
 */

import { getAccessTokenBounded } from "../authorized-post";
import { getWebAppUrl } from "../web-app-url";
import type { GovDiscountKind } from "../gov-discount";

const TIMEOUT_MS = 8_000;

export interface ApproverChoice {
  userId: string;
  name: string;
  hasPin: boolean;
}

export type ApproversResult =
  | { status: "ok"; approvers: ApproverChoice[] }
  | { status: "offline" }
  | { status: "error"; message: string };

export type ApprovalResult =
  | { status: "approved"; approvalId: string; approverName: string }
  | { status: "refused"; message: string }
  | { status: "offline" };

/** A bounded, bearer-authenticated call to a web route; null = offline/timeout. */
export async function callWebRoute(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> } | null> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("timeout"));
    }, TIMEOUT_MS);
  });

  try {
    const token = await Promise.race([getAccessTokenBounded(TIMEOUT_MS), expiry]);
    if (!token) return null;
    const response = await Promise.race([
      fetch(`${getWebAppUrl()}${path}`, {
        method: init.method,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      }),
      expiry,
    ]);
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: response.ok, status: response.status, json };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function messageOf(json: Record<string, unknown>, fallback: string): string {
  return typeof json.error === "string" && json.error.trim() !== "" ? json.error : fallback;
}

export async function fetchApprovers(
  tenantId: string,
  outletId: string | null,
): Promise<ApproversResult> {
  const query = new URLSearchParams({ tenantId, ...(outletId ? { outletId } : {}) });
  const response = await callWebRoute(`/api/gov-discounts/approvers?${query.toString()}`, { method: "GET" });
  if (!response) return { status: "offline" };
  if (!response.ok) return { status: "error", message: messageOf(response.json, "Could not load managers.") };
  const approvers = Array.isArray(response.json.approvers) ? (response.json.approvers as ApproverChoice[]) : [];
  return { status: "ok", approvers };
}

export interface ApprovalAsk {
  tenantId: string;
  approverUserId: string;
  pin: string;
  reduction: number;
  outletId: string | null;
  claimants: { kind: GovDiscountKind; name: string; idMasked: string }[];
}

export async function requestApproval(ask: ApprovalAsk): Promise<ApprovalResult> {
  const response = await callWebRoute("/api/gov-discounts/approve", { method: "POST", body: ask });
  if (!response) return { status: "offline" };
  if (!response.ok) {
    return { status: "refused", message: messageOf(response.json, "That PIN could not be checked.") };
  }
  const { approvalId, approverName } = response.json;
  if (typeof approvalId !== "string" || typeof approverName !== "string") {
    return { status: "refused", message: "The approval could not be confirmed. Try again." };
  }
  return { status: "approved", approvalId, approverName };
}

export async function saveOwnApprovalPin(
  tenantId: string,
  pin: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const response = await callWebRoute("/api/gov-discounts/pin", { method: "POST", body: { tenantId, pin } });
  if (!response) return { ok: false, message: "No connection. Try again when you are online." };
  if (!response.ok) return { ok: false, message: messageOf(response.json, "Could not save the PIN.") };
  return { ok: true };
}
