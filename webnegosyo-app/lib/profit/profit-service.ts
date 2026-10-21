/**
 * Reading Profit: the three report functions
 * (supabase/migrations/20261022120300_report_profit.sql), called as the
 * signed-in user so RLS and `reporting.assert_profit_access` decide — never a
 * privileged path. Then the web's one profit model shapes them.
 *
 * Each call answers a result instead of throwing, so the trend failing never
 * takes the sentence card down. The client is injected; tests pass a fake.
 */

import { withDeadline } from "../offline/deadline";
import { buildProfitReport, profitTrend, type ProfitReport, type ProfitTrendPoint } from "./profit-model";
import { bucketKeys, bucketLabel, previousFullWindow, trendGrainFor, TREND_BARS, type ProfitWindow } from "./profit-period";
import { toExpenseCategoryTotals, toProfitFigures, toProfitPeriods } from "./profit-rows";
import type { ExpenseCategoryTotal, ProfitFigures, ProfitPeriodFigures } from "./profit-types";
import { PROFIT_LOCKED_MESSAGE } from "./profit-view";

const REQUEST_MS = 20_000;

export interface ProfitRpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
}

export type ProfitFailureKind = "forbidden" | "invalid" | "not_set_up" | "failed";
export type ProfitResult<T> = { ok: true; data: T } | { ok: false; kind: ProfitFailureKind; message: string };

export const PROFIT_FAILED_MESSAGE = "Profit couldn’t load. Pull down to try again.";
export const PROFIT_NOT_SET_UP_MESSAGE = "Profit isn’t switched on for this store yet. Update the app or try again later.";

/** Which branch the read covers: one, only the unassigned/store-wide rows, or everything. */
export interface ProfitBranch {
  outletId: string | null;
  unassigned: boolean;
}

export interface ProfitArgs {
  tenantId: string;
  start: number;
  end: number;
  branch: ProfitBranch;
}

function baseArgs(args: ProfitArgs): Record<string, unknown> {
  return {
    p_tenant: args.tenantId,
    p_from: new Date(args.start).toISOString(),
    p_to: new Date(args.end).toISOString(),
    // Defaults are left out, not sent as null: the functions' own defaults apply.
    ...(args.branch.outletId !== null ? { p_outlet: args.branch.outletId } : {}),
    ...(args.branch.unassigned ? { p_unassigned: true } : {}),
  };
}

export async function callProfit<T>(
  client: ProfitRpcClient,
  fn: string,
  args: Record<string, unknown>,
  map: (data: unknown) => T,
): Promise<ProfitResult<T>> {
  let reply: { data: unknown; error: { code?: string; message?: string } | null };
  try {
    reply = await withDeadline(Promise.resolve(client.rpc(fn, args)), REQUEST_MS);
  } catch {
    return { ok: false, kind: "failed", message: PROFIT_FAILED_MESSAGE };
  }
  if (reply.error) {
    const { code, message } = reply.error;
    if (code === "42501") return { ok: false, kind: "forbidden", message: PROFIT_LOCKED_MESSAGE };
    // The functions' own range sentences are written for staff.
    if (code === "22023") return { ok: false, kind: "invalid", message: message || "That period can’t be read." };
    if (code === "PGRST202" || code === "42883") return { ok: false, kind: "not_set_up", message: PROFIT_NOT_SET_UP_MESSAGE };
    console.warn(`[profit] ${fn} failed`, code, message);
    return { ok: false, kind: "failed", message: PROFIT_FAILED_MESSAGE };
  }
  try {
    return { ok: true, data: map(reply.data) };
  } catch (error) {
    console.warn(`[profit] ${fn} returned an unexpected shape`, error);
    return { ok: false, kind: "failed", message: PROFIT_FAILED_MESSAGE };
  }
}

export interface TrendBar {
  key: string;
  label: string;
  profitCents: number;
  netSalesCents: number;
  /** The bucket still running. */
  isIncomplete: boolean;
}

export type ProfitScreenData =
  | { status: "ready"; report: ProfitReport; isFirstRun: boolean; trend: TrendBar[] | null }
  | { status: "locked" | "invalid" | "not_set_up" | "failed"; message: string };

export interface ProfitReads {
  summary: ProfitResult<ProfitFigures>;
  categories: ProfitResult<ExpenseCategoryTotal[]>;
  previousCategories: ProfitResult<ExpenseCategoryTotal[]> | null;
  periods: ProfitResult<ProfitPeriodFigures[]> | null;
}

function trendBars(w: ProfitWindow, periods: readonly ProfitPeriodFigures[], report: ProfitReport): TrendBar[] {
  const grain = trendGrainFor(w);
  const keys = bucketKeys(w, grain);
  const points: ProfitTrendPoint[] = profitTrend(keys, periods, report.ingredientBasis);
  return points
    .map((point, index) => ({
      key: point.bucket,
      label: bucketLabel(point.bucket, grain),
      profitCents: point.profitCents,
      netSalesCents: point.netSalesCents,
      isIncomplete: w.isPartial && index === keys.length - 1,
    }))
    .slice(-TREND_BARS);
}

/** Four reads → what the screen shows. The summary and categories must both land; the rest is optional. */
export function composeProfit(w: ProfitWindow, reads: ProfitReads): ProfitScreenData {
  const blocking = !reads.summary.ok ? reads.summary : !reads.categories.ok ? reads.categories : null;
  if (blocking && !blocking.ok) {
    const status = blocking.kind === "forbidden" ? "locked" : blocking.kind;
    return { status, message: blocking.message };
  }
  if (!reads.summary.ok || !reads.categories.ok) return { status: "failed", message: PROFIT_FAILED_MESSAGE };
  const report = buildProfitReport({
    figures: reads.summary.data,
    categories: reads.categories.data,
    previousCategories: reads.previousCategories?.ok ? reads.previousCategories.data : null,
  });
  return {
    status: "ready",
    report,
    isFirstRun: reads.summary.data.expenseCount === 0,
    trend: reads.periods?.ok ? trendBars(w, reads.periods.data, report) : null,
  };
}

/** Everything the screen needs, read in parallel as the user. Never throws. */
export async function readProfit(client: ProfitRpcClient, w: ProfitWindow, args: Omit<ProfitArgs, "start" | "end">): Promise<ProfitScreenData> {
  const current: ProfitArgs = { ...args, start: w.start, end: w.end };
  const previous = previousFullWindow(w);
  const [summary, categories, previousCategories, periods] = await Promise.all([
    callProfit(client, "report_profit_summary", baseArgs(current), toProfitFigures),
    callProfit(client, "report_expenses_by_category", baseArgs(current), toExpenseCategoryTotals),
    previous
      ? callProfit(client, "report_expenses_by_category", baseArgs({ ...current, ...previous }), toExpenseCategoryTotals)
      : Promise.resolve(null),
    callProfit(client, "report_profit_by_period", { ...baseArgs(current), p_grain: trendGrainFor(w) }, toProfitPeriods),
  ]);
  return composeProfit(w, { summary, categories, previousCategories, periods });
}
