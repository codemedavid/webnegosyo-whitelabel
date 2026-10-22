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
import { buildProfitReport, ingredientBasisOf, profitTrend, type ProfitReport } from "./profit-model";
import { bucketLabel, recurringCompareWindow, trendPlan, type ProfitWindow } from "./profit-period";
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

type FailedStatus = "locked" | "invalid" | "not_set_up" | "failed";

export type ProfitScreenData =
  | { status: "ready"; report: ProfitReport; isFirstRun: boolean; trend: TrendBar[] | null; trendTitle: string }
  | { status: FailedStatus; message: string };

export interface ProfitReads {
  summary: ProfitResult<ProfitFigures>;
  categories: ProfitResult<ExpenseCategoryTotal[]>;
  previousCategories: ProfitResult<ExpenseCategoryTotal[]> | null;
  periods: ProfitResult<ProfitPeriodFigures[]> | null;
  /** Whether the store has EVER recorded an expense; null = not asked or unknown. */
  everRecorded?: boolean | null;
}

/**
 * One bar per planned bucket. Buckets inside the window use the window's
 * ingredient basis (so they add up to the hero exactly); whole earlier
 * periods use their own (a store that started counting stock this month
 * was estimating from purchases before).
 */
function trendBars(w: ProfitWindow, periods: readonly ProfitPeriodFigures[], report: ProfitReport): TrendBar[] {
  const plan = trendPlan(w);
  const byBucket = new Map(periods.map((row) => [row.bucket, row]));
  return plan.keys.map((key, index) => {
    const basis = key >= plan.windowKey ? report.ingredientBasis : ingredientBasisOf(byBucket.get(key)?.saleMovements ?? 0);
    const [point] = profitTrend([key], periods, basis);
    return {
      key,
      label: bucketLabel(key, plan.grain),
      profitCents: point.profitCents,
      netSalesCents: point.netSalesCents,
      isIncomplete: w.isPartial && index === plan.keys.length - 1,
    };
  });
}

function failedStatus(kind: ProfitFailureKind): FailedStatus {
  return kind === "forbidden" ? "locked" : kind;
}

/** Four reads → what the screen shows. The summary and categories must both land; the rest is optional. */
export function composeProfit(w: ProfitWindow, reads: ProfitReads): ProfitScreenData {
  const blocking = !reads.summary.ok ? reads.summary : !reads.categories.ok ? reads.categories : null;
  if (blocking && !blocking.ok) return { status: failedStatus(blocking.kind), message: blocking.message };
  if (!reads.summary.ok || !reads.categories.ok) return { status: "failed", message: PROFIT_FAILED_MESSAGE };
  const report = buildProfitReport({
    figures: reads.summary.data,
    categories: reads.categories.data,
    previousCategories: reads.previousCategories?.ok ? reads.previousCategories.data : null,
  });
  return {
    status: "ready",
    report,
    // First run = the store has never recorded an expense, not "none in this
    // window": an established store on a Monday's "This week" is not new.
    // Unknown counts as not first-run; the no_expenses finding still offers Add.
    isFirstRun: reads.summary.data.expenseCount === 0 && reads.everRecorded === false,
    trend: reads.periods?.ok ? trendBars(w, reads.periods.data, report) : null,
    trendTitle: trendPlan(w).title,
  };
}

export interface ProfitReadOptions {
  /** Asked only when the window has no expenses: has the store ever recorded one? */
  hasAnyExpense?: () => Promise<boolean | null>;
}

/** Everything the screen needs, read in parallel as the user. Never throws. */
export async function readProfit(
  client: ProfitRpcClient,
  w: ProfitWindow,
  args: Omit<ProfitArgs, "start" | "end">,
  options: ProfitReadOptions = {},
): Promise<ProfitScreenData> {
  const current: ProfitArgs = { ...args, start: w.start, end: w.end };
  const previous = recurringCompareWindow(w);
  const plan = trendPlan(w);
  const summaryRead = callProfit(client, "report_profit_summary", baseArgs(current), toProfitFigures);
  const everRead = summaryRead.then((summary) =>
    summary.ok && summary.data.expenseCount === 0 && options.hasAnyExpense ? options.hasAnyExpense().catch(() => null) : null,
  );
  const [summary, categories, previousCategories, periods, everRecorded] = await Promise.all([
    summaryRead,
    callProfit(client, "report_expenses_by_category", baseArgs(current), toExpenseCategoryTotals),
    previous
      ? callProfit(client, "report_expenses_by_category", baseArgs({ ...current, ...previous }), toExpenseCategoryTotals)
      : Promise.resolve(null),
    callProfit(client, "report_profit_by_period", { ...baseArgs({ ...current, start: plan.start }), p_grain: plan.grain }, toProfitPeriods),
    everRead,
  ]);
  return composeProfit(w, { summary, categories, previousCategories, periods, everRecorded });
}

/** The two figures a glance (Home, Reports, Expenses) shows. */
export interface ProfitGlance {
  profitCents: number;
  ratios: { profit: number | null };
  isPartial: boolean;
}

export type ProfitGlanceData = { status: "ready"; glance: ProfitGlance } | { status: FailedStatus; message: string };

/** A ready Profit read, cut down to what a glance shows. */
export function glanceOf(report: ProfitReport, w: Pick<ProfitWindow, "isPartial">): ProfitGlance {
  return { profitCents: report.profitCents, ratios: { profit: report.ratios.profit }, isPartial: w.isPartial };
}

/**
 * The light read behind a glance: the summary function alone (one RPC, not
 * Profit's four), shaped by the same model so the figure equals the screen's.
 * Every tenant shares this database, and Home re-reads on every focus.
 */
export async function readProfitGlance(client: ProfitRpcClient, w: ProfitWindow, args: Omit<ProfitArgs, "start" | "end">): Promise<ProfitGlanceData> {
  const summary = await callProfit(client, "report_profit_summary", baseArgs({ ...args, start: w.start, end: w.end }), toProfitFigures);
  if (!summary.ok) return { status: failedStatus(summary.kind), message: summary.message };
  const report = buildProfitReport({ figures: summary.data, categories: [], previousCategories: null });
  return { status: "ready", glance: glanceOf(report, w) };
}

/** The slice of supabase-js the first-run check uses. */
export interface ExpenseTableClient {
  from(table: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/**
 * Has this store ever recorded an expense? One indexed row (limit 1 on
 * `expenses_tenant_spent_idx`), as the user, so RLS decides. Null when the
 * read fails: "unknown" never greets an established store as new.
 */
export async function anyExpenseRecorded(db: ExpenseTableClient, tenantId: string): Promise<boolean | null> {
  try {
    const reply = (await withDeadline(
      Promise.resolve(db.from("expenses").select("id").eq("tenant_id", tenantId).limit(1)),
      REQUEST_MS,
    )) as { data: unknown; error: unknown };
    if (reply.error) return null;
    return Array.isArray(reply.data) && reply.data.length > 0;
  } catch {
    return null;
  }
}
