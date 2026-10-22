/**
 * The reads behind the money glances (lib/expenses/money-glance.ts) — on the
 * shared cache, so Home, Reports, Profit and Expenses share one answer.
 *
 * Every hook here is quiet on failure: a glance that cannot be read is hidden,
 * never an error on a screen that is about something else.
 */

import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "expo-router";

import { useAuthStore } from "../../stores/auth-store";
import { useBranchContextStore } from "../../stores/branch-context-store";
import { resourceKey } from "../backends/query-keys";
import type { CashMove } from "../cash-drawers";
import { listCashMoves } from "../cash-drawer-service";
import { ALL_BRANCHES, resolveProfitBranch } from "../profit/profit-branch";
import { resolveProfitWindow } from "../profit/profit-period";
import type { ProfitBranch, ProfitGlance } from "../profit/profit-service";
import { useProfitGlance } from "../profit/use-profit";
import { useResource } from "../query/use-resource";
import { loadOpenShift } from "../shift-service";
import { useAccountBranchScope, useBranchScope } from "../use-branch-scope";
import { useOutlets } from "../use-outlets";
import { liveExpenseDb } from "./expense-client";
import { manilaToday, monthLabel, monthOf } from "./expense-format";
import { monthSpentCents } from "./expense-list";
import { listMovementLinks, type MovementLink } from "./expense-service";
import { queuedSpends, spentOn, type SpendGlance } from "./money-glance";
import { SHIFT_LINKS_RESOURCE } from "./use-drawer-expenses";
import {
  useDeviceExpenseQueue,
  useExpenseCategories,
  useExpenseMonth,
  useExpenseTenant,
  useRecentExpenses,
} from "./use-expenses";

/**
 * Today's Manila date, re-read whenever the screen comes back into view: Home
 * stays mounted for days, so a value taken once would keep yesterday's
 * "Spent today" (and last month's "Kept") past midnight.
 */
export function useManilaDay(): string {
  const [day, setDay] = useState(manilaToday);
  useFocusEffect(
    useCallback(() => {
      setDay(manilaToday());
    }, []),
  );
  // A render after midnight (any re-render) moves on too, without waiting for a focus.
  const now = manilaToday();
  return now > day ? now : day;
}

/**
 * Today's spending from the recent rows (already on the phone for the repeat
 * chips) plus what this phone still holds unsent, for the branch being viewed
 * — a branch-locked account always reads its own branch (`useBranchScope`
 * only narrows). Null until the categories are in: without them cash merely
 * moved (owner took cash, deposits) would briefly read as spending.
 */
export function useSpentToday(isEnabled: boolean): SpendGlance | null {
  const recent = useRecentExpenses(isEnabled);
  const categoriesRead = useExpenseCategories();
  const queue = useDeviceExpenseQueue();
  const scope = useBranchScope();
  const today = useManilaDay();
  const outletId = scope.kind === "branch" ? scope.outletId : null;
  const categories = categoriesRead.data;
  const hasData = recent.data !== undefined;
  const queued = useMemo(() => queuedSpends(queue.expenses), [queue.expenses]);
  return useMemo(
    () => (isEnabled && hasData && categories ? spentOn(recent.expenses, categories, today, outletId, queued) : null),
    [isEnabled, hasData, recent.expenses, categories, today, outletId, queued],
  );
}

/** This month's spending, read exactly as the Expenses screen reads it (same cache entry). Null until the categories are in. */
export function useMonthSpent(): { cents: number; monthName: string } | null {
  const selectedOutlet = useBranchContextStore((s) => s.selectedOutletId);
  const month = monthOf(useManilaDay());
  const read = useExpenseMonth(month, selectedOutlet ?? undefined);
  const categories = useExpenseCategories().data;
  const expenses = read.data?.expenses;
  return useMemo(
    () => (expenses && categories ? { cents: monthSpentCents(expenses, categories).spentCents, monthName: monthLabel(month) } : null),
    [expenses, categories, month],
  );
}

/**
 * This month's profit for a glance (same window and branch rule as Profit):
 * the Profit screen's cached read when fresh, else one summary RPC — Home and
 * Reports re-read on every focus, on a database every store shares.
 */
export function useKeptThisMonth(isEnabled: boolean): ProfitGlance | null {
  const today = useManilaDay();
  // Keyed to the Manila day: the window's identity changes with the clock,
  // and the read's end comes from `windowAt` when it runs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const period = useMemo(() => resolveProfitWindow({ preset: "this_month" }, Date.now()), [today]);
  return useProfitGlance(period, useKeptThisMonthBranch(), isEnabled);
}

/** The branch "Kept this month" covers (Profit's rule): its bills are the ones "left to pay". */
export function useKeptThisMonthBranch(): ProfitBranch {
  const accountOutletName = useAuthStore((s) => s.outletName);
  const selectedOutlet = useBranchContextStore((s) => s.selectedOutletId);
  const account = useAccountBranchScope();
  const { outlets } = useOutlets();
  const { branch } = resolveProfitBranch({ account, accountOutletName, outlets, choice: selectedOutlet ?? ALL_BRANCHES });
  return branch;
}

/** Whether this person has a shift open right now — re-read whenever the screen comes back into view. */
export function useHasOpenShift(isEnabled: boolean): boolean {
  const tenantId = useExpenseTenant();
  const userId = useAuthStore((s) => s.userId);
  const [hasShift, setHasShift] = useState(false);
  useFocusEffect(
    useCallback(() => {
      if (!isEnabled || !tenantId || !userId) {
        setHasShift(false);
        return;
      }
      let isActive = true;
      loadOpenShift(tenantId, userId)
        .then((shift) => isActive && setHasShift(shift !== null))
        .catch(() => isActive && setHasShift(false));
      return () => {
        isActive = false;
      };
    }, [isEnabled, tenantId, userId]),
  );
  return hasShift;
}

const NO_LINKS: ReadonlyMap<string, MovementLink> = new Map();
const LINKS_STALE_MS = 15_000;

/** Which of these pay-outs were expenses — one bounded read for every drawer on the floor. */
export function usePayoutLinks(moves: readonly CashMove[] | null, isEnabled: boolean): ReadonlyMap<string, MovementLink> | null {
  const tenantId = useExpenseTenant();
  const payoutIds = useMemo(
    () => (moves ?? []).filter((move) => move.kind === "pay_out").map((move) => move.id).sort(),
    [moves],
  );
  const fetcher = useCallback(() => listMovementLinks(liveExpenseDb, tenantId as string, payoutIds), [tenantId, payoutIds]);
  const links = useResource<Map<string, MovementLink>>(
    tenantId && isEnabled && payoutIds.length > 0 ? resourceKey(SHIFT_LINKS_RESOURCE, tenantId, "floor", payoutIds.join(",")) : null,
    fetcher,
    { staleTime: LINKS_STALE_MS },
  );
  if (!isEnabled) return null;
  if (payoutIds.length === 0) return NO_LINKS;
  return links.data ?? null;
}

/**
 * History pages read at most this many shifts' cash moves per request (chunks
 * of an IN list). `listCashMoves` does not page, and the API caps a response
 * at 1000 rows: 20 shifts keeps a request well under it (50 moves a shift).
 */
const HISTORY_SHIFT_CHUNK = 20;
const HISTORY_MAX_SHIFTS = 200;

export interface ShiftHistoryPayouts {
  movesByShift: ReadonlyMap<string, CashMove[]>;
  links: ReadonlyMap<string, MovementLink>;
}

export async function readHistoryPayouts(tenantId: string, shiftIds: readonly string[]): Promise<ShiftHistoryPayouts> {
  const capped = shiftIds.slice(0, HISTORY_MAX_SHIFTS);
  const chunks: string[][] = [];
  for (let i = 0; i < capped.length; i += HISTORY_SHIFT_CHUNK) chunks.push(capped.slice(i, i + HISTORY_SHIFT_CHUNK));
  const moves = (await Promise.all(chunks.map((ids) => listCashMoves(tenantId, ids)))).flat();
  const payoutIds = moves.filter((move) => move.kind === "pay_out").map((move) => move.id);
  const links = payoutIds.length > 0 ? await listMovementLinks(liveExpenseDb, tenantId, payoutIds) : new Map<string, MovementLink>();
  const movesByShift = new Map<string, CashMove[]>();
  for (const move of moves) movesByShift.set(move.shiftId, [...(movesByShift.get(move.shiftId) ?? []), move]);
  return { movesByShift, links };
}

/** The pay-outs of a page of past shifts, told apart. Null while loading or when the read failed. */
export function useShiftHistoryPayouts(shiftIds: readonly string[]): ShiftHistoryPayouts | null {
  const tenantId = useExpenseTenant();
  const ids = useMemo(() => [...shiftIds].sort(), [shiftIds]);
  const fetcher = useCallback(() => readHistoryPayouts(tenantId as string, ids), [tenantId, ids]);
  const result = useResource<ShiftHistoryPayouts>(
    tenantId && ids.length > 0 ? resourceKey(SHIFT_LINKS_RESOURCE, tenantId, "history", ids.join(",")) : null,
    fetcher,
    { staleTime: LINKS_STALE_MS },
  );
  return result.data ?? null;
}
