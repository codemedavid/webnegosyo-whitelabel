/**
 * Reads for the Expenses screen: the window's month(s), the month before (for
 * the change pill), "Kept so far" from Profit, and the branch words.
 *
 * Month reads use the SAME cache key as `useExpenseMonth`, so the screen, the
 * detail screen and `invalidateExpenses` all see one copy. A Profit range can
 * touch up to four months; each has a fixed hook slot (hooks can't loop).
 */

import { useCallback, useMemo } from "react";

import { useAuthStore } from "../../stores/auth-store";
import { useBranchContextStore } from "../../stores/branch-context-store";
import { resourceKey } from "../backends/query-keys";
import { resolveProfitBranch, ALL_BRANCHES } from "../profit/profit-branch";
import { resolveProfitWindow, type ProfitSelection } from "../profit/profit-period";
import { useTradingDay } from "../business-day/use-trading-day";
import { canSeeProfit } from "../profit/profit-view";
import { useProfitGlance } from "../profit/use-profit";
import { useResource } from "../query/use-resource";
import { useAccountBranchScope } from "../use-branch-scope";
import { useOutlets } from "../use-outlets";
import { liveExpenseDb } from "./expense-client";
import { monthBounds, monthOf, shiftMonth } from "./expense-format";
import { listExpenses, type ExpenseMonth } from "./expense-service";
import { monthsCovering, type DayRange } from "./expenses-home";
import { EXPENSE_MONTH_RESOURCE, useExpenseMonth, useExpenseTenant } from "./use-expenses";
import type { Expense } from "./types";

const LIST_STALE_MS = 30_000;
const NO_EXPENSES: Expense[] = [];

/** One month's book, or nothing when `month` is null (an unused slot). */
function useOptionalMonth(month: string | null, outletId: string | undefined) {
  const tenantId = useExpenseTenant();
  const fetcher = useCallback(
    () => listExpenses(liveExpenseDb, { tenantId: tenantId as string, month: month as string, outletId }),
    [tenantId, month, outletId],
  );
  return useResource<ExpenseMonth>(
    tenantId && month ? resourceKey(EXPENSE_MONTH_RESOURCE, tenantId, month, outletId ?? "all") : null,
    fetcher,
    { staleTime: LIST_STALE_MS },
  );
}

export interface ExpenseWindowData {
  expenses: Expense[];
  /** The month before (month view only); null while unknown or in a range. */
  previous: Expense[] | null;
  /** True until every month in the window has answered once. */
  isLoading: boolean;
  hasData: boolean;
  error: string | null;
  isTruncated: boolean;
  isRefetching: boolean;
  refetch: () => Promise<void>;
}

export function useExpenseWindow(month: string, range: DayRange | null, outletId: string | undefined): ExpenseWindowData {
  const months = range ? monthsCovering(range) : [month];
  const first = useExpenseMonth(months[0], outletId);
  const second = useOptionalMonth(months[1] ?? null, outletId);
  const third = useOptionalMonth(months[2] ?? null, outletId);
  const fourth = useOptionalMonth(months[3] ?? null, outletId);
  const previous = useOptionalMonth(range ? null : shiftMonth(month, -1), outletId);
  const reads = [first, second, third, fourth].slice(0, months.length);

  const slotCount = months.length;
  const expenses = useMemo(() => {
    const datas = [first.data, second.data, third.data, fourth.data].slice(0, slotCount);
    return datas.every((data) => data === undefined) ? NO_EXPENSES : datas.flatMap((data) => data?.expenses ?? []);
  }, [first.data, second.data, third.data, fourth.data, slotCount]);
  const { refetch: refetchFirst } = first;
  const { refetch: refetchSecond } = second;
  const { refetch: refetchThird } = third;
  const { refetch: refetchFourth } = fourth;
  const { refetch: refetchPrevious } = previous;
  const refetch = useCallback(
    () =>
      Promise.all([refetchFirst(), refetchSecond(), refetchThird(), refetchFourth(), refetchPrevious()]).then(() => undefined),
    [refetchFirst, refetchSecond, refetchThird, refetchFourth, refetchPrevious],
  );

  return {
    expenses,
    previous: previous.data?.expenses ?? null,
    isLoading: reads.some((read) => read.isLoading && read.data === undefined),
    hasData: reads.every((read) => read.data !== undefined),
    error: reads.map((read) => read.error).find((error) => error !== null) ?? null,
    isTruncated: reads.some((read) => read.data?.isTruncated === true),
    isRefetching: reads.some((read) => read.isRefetching),
    refetch,
  };
}

export interface KeptFigure {
  cents: number;
  /** The period is still running ("so far"). */
  isPartial: boolean;
}

function profitSelectionFor(month: string, range: DayRange | null, nowMs: number): ProfitSelection {
  if (range) return { preset: "custom", fromKey: range.from, toKey: range.to };
  if (month === monthOf(nowMs)) return { preset: "this_month" };
  const bounds = monthBounds(month);
  return { preset: "custom", fromKey: bounds.from, toKey: bounds.to };
}

/**
 * "Kept so far" for the window, from Profit's own model — only for people who
 * may see Profit on a platform-backend store (as `profit.tsx` decides). Null
 * when hidden, loading or failed: the hero then simply leaves it out.
 */
export function useKeptFigure(month: string, range: DayRange | null): KeptFigure | null {
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const accountOutletName = useAuthStore((s) => s.outletName);
  const selectedOutlet = useBranchContextStore((s) => s.selectedOutletId);
  const account = useAccountBranchScope();
  const { outlets } = useOutlets();

  // Only the month in progress: stepping back through months must not start a
  // fresh Profit read each time. The light glance read (one summary call, or
  // the Profit screen's cached result) is the one Home's "Kept" row shares.
  const isCurrentMonth = range === null && month === monthOf(Date.now());
  const isEnabled = isCurrentMonth && canSeeProfit({ role, isOwner, permissions }) && orderBackend === "platform";
  // Business days, as the profit SQL dates its facts (20261027180000).
  const { schedule } = useTradingDay();
  const period = resolveProfitWindow(profitSelectionFor(month, range, Date.now()), Date.now(), schedule);
  const { branch } = resolveProfitBranch({ account, accountOutletName, outlets, choice: selectedOutlet ?? ALL_BRANCHES });
  const glance = useProfitGlance(period, branch, isEnabled);
  if (!isEnabled || glance === null) return null;
  return { cents: glance.profitCents, isPartial: glance.isPartial };
}

/** "Main branch", "All branches", or null for a one-branch store. */
export function useExpenseBranchLabel(): string | null {
  const accountOutletName = useAuthStore((s) => s.outletName);
  const selectedName = useBranchContextStore((s) => s.selectedOutletName);
  const account = useAccountBranchScope();
  const { outlets } = useOutlets();
  if (account.kind === "branch") return accountOutletName ?? "Your branch";
  if (selectedName) return selectedName;
  return outlets.length > 1 ? "All branches" : null;
}
