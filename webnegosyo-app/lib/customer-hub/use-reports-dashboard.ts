/**
 * The two reads behind the Reports dashboard, cached per tenant and branch.
 *
 * Both go through `useResource`, so switching tabs and coming back does not
 * re-run a lifetime order read on the platform, and pull-to-refresh is one
 * `refetch`. Each read is switched off (a null key) for an account that may not
 * see it, so nobody is refused by the server for a screen that never asked.
 */

import { useCallback } from "react";
import { useAuthStore } from "../../stores/auth-store";
import { resourceKey } from "../backends/query-keys";
import { useResource, type ResourceResult } from "../query/use-resource";
import { useBranchScope } from "../use-branch-scope";
import { fetchLoyaltyPrograms } from "../loyalty/repo";
import { fetchLoyaltyMembers } from "../loyalty/members-repo";
import { fetchHubOverview, type HubOverviewResult } from "./repo";
import type { RewardsSnapshot } from "./dashboard";
import { selectIsCustomerHubOn } from "./availability";

/** A dashboard is a report, not a live queue: five minutes fresh is plenty. */
const DASHBOARD_STALE_MS = 5 * 60 * 1000;

export function useCustomerDashboard(isAllowed: boolean): ResourceResult<HubOverviewResult> {
  const tenantId = useAuthStore((s) => s.tenantId);
  const isHubOn = useAuthStore(selectIsCustomerHubOn);
  const scope = useBranchScope();
  const outletId = scope.kind === "branch" ? scope.outletId : null;

  const fetcher = useCallback(
    () => fetchHubOverview({ tenantId: tenantId ?? "", outletId }),
    [tenantId, outletId],
  );
  const key = isAllowed && isHubOn && tenantId ? resourceKey("customer-dashboard", tenantId, outletId) : null;
  return useResource(key, fetcher, { staleTime: DASHBOARD_STALE_MS });
}

/**
 * Whether the store runs a reward card, and how it is doing. Members are read
 * only when a card is live: with none, the row's answer is "start one".
 * Null when the platform cannot answer, so the row is left out rather than
 * guessing "no reward card" for a store that has one.
 */
async function fetchRewardsSnapshot(tenantId: string): Promise<RewardsSnapshot | null> {
  const programs = await fetchLoyaltyPrograms(tenantId);
  if (!programs.ok) return null;
  const hasActiveProgram = programs.programs.some((program) => program.status === "active");
  if (!hasActiveProgram) return { hasActiveProgram, members: 0, rewardsWaiting: 0 };

  const members = await fetchLoyaltyMembers(tenantId);
  if (!members.ok) return null;
  return {
    hasActiveProgram,
    members: members.totals.total,
    rewardsWaiting: members.totals.rewardsAvailable,
  };
}

export function useRewardsSnapshot(isAllowed: boolean): ResourceResult<RewardsSnapshot | null> {
  const tenantId = useAuthStore((s) => s.tenantId);
  const fetcher = useCallback(() => fetchRewardsSnapshot(tenantId ?? ""), [tenantId]);
  const key = isAllowed && tenantId ? resourceKey("rewards-snapshot", tenantId) : null;
  return useResource(key, fetcher, { staleTime: DASHBOARD_STALE_MS });
}
