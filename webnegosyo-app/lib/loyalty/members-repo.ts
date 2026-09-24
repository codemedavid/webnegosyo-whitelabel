/**
 * Members ↔ platform.
 *
 * Failure is surfaced, never swallowed. The member list is the whole screen,
 * and a silent empty state would read as "nobody is collecting stamps" when
 * the truth is "we could not reach the platform".
 */

import { callLoyaltyApi } from "./repo";
import type {
  LoyaltyMember,
  LoyaltyMemberDetail,
  LoyaltyMemberStatus,
  LoyaltyMemberTotals,
} from "./members";

const MEMBERS_PATH = "/api/loyalty/members";

export type MembersResult =
  | { ok: true; members: LoyaltyMember[]; totals: LoyaltyMemberTotals; isTruncated: boolean }
  | { ok: false; reason: "forbidden" | "unavailable" };

export type MemberDetailResult =
  | { ok: true; detail: LoyaltyMemberDetail }
  | { ok: false; reason: "forbidden" | "missing" | "unavailable" };

export type MemberWriteResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

function errorFrom(body: Record<string, unknown> | null, fallback: string): string {
  return typeof body?.error === "string" ? body.error : fallback;
}

export async function fetchLoyaltyMembers(
  tenantId: string,
  options: { programId?: string | null; search?: string | null; status?: LoyaltyMemberStatus | null } = {},
): Promise<MembersResult> {
  const query = new URLSearchParams({ tenantId });
  if (options.programId) query.set("programId", options.programId);
  if (options.search?.trim()) query.set("search", options.search.trim());
  if (options.status) query.set("status", options.status);

  const result = await callLoyaltyApi(MEMBERS_PATH, "GET", { tenantId, query: `?${query}` });
  if (result.status === 401 || result.status === 403) return { ok: false, reason: "forbidden" };
  if (result.status !== 200 || !result.body || !Array.isArray(result.body.members)) {
    return { ok: false, reason: "unavailable" };
  }
  return {
    ok: true,
    members: result.body.members as LoyaltyMember[],
    totals: result.body.totals as LoyaltyMemberTotals,
    isTruncated: result.body.isTruncated === true,
  };
}

export async function fetchLoyaltyMember(
  tenantId: string,
  customerKey: string,
): Promise<MemberDetailResult> {
  const query = new URLSearchParams({ tenantId, customerKey });
  const result = await callLoyaltyApi(MEMBERS_PATH, "GET", { tenantId, query: `?${query}` });
  if (result.status === 401 || result.status === 403) return { ok: false, reason: "forbidden" };
  if (result.status === 404) return { ok: false, reason: "missing" };
  if (result.status !== 200 || !result.body?.member) return { ok: false, reason: "unavailable" };
  return { ok: true, detail: result.body as unknown as LoyaltyMemberDetail };
}

export async function adjustMemberBalance(
  tenantId: string,
  adjustment: {
    programId: string;
    customerKey: string;
    delta: number;
    note: string;
    requestId: string;
  },
): Promise<MemberWriteResult> {
  const result = await callLoyaltyApi(MEMBERS_PATH, "POST", {
    tenantId,
    body: { action: "adjust_balance", adjustment },
  });
  if (result.status !== 200) {
    return { ok: false, error: errorFrom(result.body, "Could not reach the platform.") };
  }
  // A replay already did the work; saying "failed" would invite a third tap.
  if (result.body?.isDuplicate === true) {
    return { ok: true, message: "That change was already saved." };
  }
  const issued = Number(result.body?.rewardsIssued) || 0;
  return {
    ok: true,
    message:
      issued > 0
        ? `Saved — ${issued} reward${issued === 1 ? "" : "s"} unlocked.`
        : "Balance updated.",
  };
}

export async function resolveMemberReward(
  tenantId: string,
  resolution: { entitlementId: string; action: "consume" | "void"; note: string },
): Promise<MemberWriteResult> {
  const result = await callLoyaltyApi(MEMBERS_PATH, "POST", {
    tenantId,
    body: { action: "resolve_reward", resolution },
  });
  if (result.status !== 200) {
    return { ok: false, error: errorFrom(result.body, "Could not reach the platform.") };
  }
  return {
    ok: true,
    message: resolution.action === "consume" ? "Marked as used." : "Reward cancelled.",
  };
}
