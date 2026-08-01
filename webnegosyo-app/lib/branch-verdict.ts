/**
 * What to do about each branch — one verdict, never a list.
 *
 * Five KPIs across four branches is twenty numbers, and twenty numbers is not a
 * decision. This module is what turns the comparison into one: for every branch,
 * the single next action, and across the store, the one branch worth copying.
 *
 * **The fix-order is the opinion.** A branch usually fails several benchmarks at
 * once, and telling an owner all of them is the same as telling them nothing:
 *
 * 1. **Leak** — cancellations. Money already earned and then thrown away, and
 *    normally the cheapest thing in the list to fix, so it is never buried under
 *    a growth suggestion.
 * 2. **Customers** — too few orders a day. No amount of upselling rescues an
 *    empty dining room.
 * 3. **Ticket size** — enough traffic, small tickets. This is what the upsell,
 *    bundle and "make it a meal" machinery already in the platform is for.
 * 4. **Repeat guests** — volume and ticket are healthy, but nobody comes back.
 *
 * Steps 2–4 follow the Hormozi ordering the Growth tab already uses, and the
 * volume/ticket thresholds are read from `growth-metrics.ts` rather than restated
 * here, so a branch and the store cannot disagree about what "too quiet" means.
 *
 * **Only one branch is ever told to scale**, and only if it clears everything.
 * A crown handed to three branches is decoration; handed to one it is an
 * instruction — this is the branch whose playbook the others should copy.
 *
 * Pure and defensive: no React, no queries, no throwing.
 */

import { DEFAULT_BENCHMARKS } from "./growth-metrics";
import type { BranchKpis } from "./branch-kpis";

export type BranchVerdictKind =
  | "no-data"
  | "unattributed"
  | "leak"
  | "customers"
  | "aov"
  | "repeat"
  | "steady"
  | "scale";

/** How the UI should colour the verdict. */
export type VerdictTone = "good" | "warn" | "bad" | "neutral";

export interface BranchVerdict {
  kind: BranchVerdictKind;
  /** Short pill text, e.g. "SCALE THIS ONE". */
  label: string;
  /** One sentence naming the next action. */
  action: string;
  tone: VerdictTone;
}

export interface BranchVerdictBenchmarks {
  /** Below this many orders a day, volume is the constraint. */
  minOrdersPerDay: number;
  /** Below this average ticket, ticket size is the constraint. */
  minAov: number;
  /** Below this share of repeat orders, loyalty is the constraint. */
  minRepeatRate: number;
  /** Above this share of cancelled orders, the leak is the constraint. */
  maxCancellationRate: number;
  /**
   * Below this share of identified orders, the repeat rate is not judged at all.
   * A counter-heavy branch takes mostly anonymous orders, so a low repeat rate
   * describes the data, not the guests — acting on it would send the owner
   * chasing a number this platform cannot measure for them.
   */
  minIdentifiedShare: number;
}

/** Volume and ticket floors come from the Growth tab; the rest are set here. */
export const DEFAULT_VERDICT_BENCHMARKS: BranchVerdictBenchmarks = {
  minOrdersPerDay: DEFAULT_BENCHMARKS.minOrdersPerDay,
  minAov: DEFAULT_BENCHMARKS.minAov,
  minRepeatRate: 0.2,
  maxCancellationRate: 0.1,
  minIdentifiedShare: 0.25,
};

const VERDICT_COPY: Record<BranchVerdictKind, { label: string; action: string; tone: VerdictTone }> =
  {
    "no-data": {
      label: "No orders yet",
      action: "This branch has taken nothing in this period. Check it is live and taking orders.",
      tone: "neutral",
    },
    unattributed: {
      label: "Unassigned",
      action:
        "Orders that did not record which branch fulfilled them. They still count toward your store total.",
      tone: "neutral",
    },
    leak: {
      label: "Fix the leak first",
      action:
        "Too many orders are being cancelled here. Find out why before spending anything on growth — this is money you already earned.",
      tone: "bad",
    },
    customers: {
      label: "Needs customers",
      action:
        "Too quiet to judge anything else. Push traffic: Messenger promos, QR table tents, referrals — not price changes.",
      tone: "warn",
    },
    aov: {
      label: "Needs bigger tickets",
      action:
        "Traffic is fine but tickets are small. Turn on upsells, bundles and meal upgrades here before chasing more customers.",
      tone: "warn",
    },
    repeat: {
      label: "Needs repeat guests",
      action:
        "People buy once and do not come back. Look at speed, accuracy and follow-up at this branch — a returning guest costs nothing to win.",
      tone: "warn",
    },
    steady: {
      label: "Steady",
      action: "Clearing every benchmark. Keep it running and watch the trend.",
      tone: "good",
    },
    scale: {
      label: "Scale this one",
      action:
        "Your strongest branch per hour it trades, and healthy on every measure. Copy what it does at the others, and give it more hours or capacity.",
      tone: "good",
    },
  };

export interface VerdictOptions {
  /** Days in the window, so an order count becomes orders-per-day. */
  periodDays: number;
  benchmarks?: BranchVerdictBenchmarks;
  /** True for the one branch chosen to be crowned. */
  isLeader?: boolean;
}

/** The constraint this branch is failing, or null when it clears them all. */
function resolveConstraint(
  row: BranchKpis,
  periodDays: number,
  benchmarks: BranchVerdictBenchmarks,
): BranchVerdictKind | null {
  if (row.outletId === null) return "unattributed";
  if (row.orderCount <= 0) return "no-data";

  if (row.cancellationRate > benchmarks.maxCancellationRate) return "leak";

  const ordersPerDay = periodDays > 0 ? row.orderCount / periodDays : 0;
  if (ordersPerDay < benchmarks.minOrdersPerDay) return "customers";

  if (row.averageOrderValue < benchmarks.minAov) return "aov";

  // Only judged when enough of the branch's guests are actually identifiable.
  if (
    row.identifiedShare >= benchmarks.minIdentifiedShare &&
    row.repeatRate < benchmarks.minRepeatRate
  ) {
    return "repeat";
  }

  return null;
}

/**
 * The one thing to do about this branch.
 *
 * `isLeader` only ever upgrades a branch that is already clearing everything —
 * a crown on a leaking branch would tell an owner to pour money into the one
 * place losing it.
 */
export function verdictFor(row: BranchKpis, options: VerdictOptions): BranchVerdict {
  const benchmarks = options.benchmarks ?? DEFAULT_VERDICT_BENCHMARKS;
  const constraint = resolveConstraint(row, options.periodDays, benchmarks);

  const kind: BranchVerdictKind =
    constraint ?? (options.isLeader === true ? "scale" : "steady");

  return { kind, ...VERDICT_COPY[kind] };
}

/** A KPI row with its verdict attached. */
export type BranchKpisWithVerdict = BranchKpis & { verdict: BranchVerdict };

export interface AssignVerdictOptions {
  periodDays: number;
  benchmarks?: BranchVerdictBenchmarks;
}

/**
 * Every branch's verdict, with the crown given to at most one.
 *
 * The crown goes to the healthy branch earning the most per hour it trades —
 * healthy first, so the best-earning branch does not get told to scale while it
 * is cancelling a fifth of its orders. A single-branch store is never crowned:
 * "copy this one at the others" has no meaning with no others, and it would read
 * as praise rather than as an instruction.
 *
 * Row order is preserved, so the caller's ranking survives.
 */
export function assignBranchVerdicts(
  rows: readonly BranchKpis[],
  options: AssignVerdictOptions,
): BranchKpisWithVerdict[] {
  const benchmarks = options.benchmarks ?? DEFAULT_VERDICT_BENCHMARKS;

  const branches = rows.filter((row) => row.outletId !== null);
  const healthy = branches.filter(
    (row) => resolveConstraint(row, options.periodDays, benchmarks) === null,
  );

  const leaderId =
    branches.length > 1 && healthy.length > 0
      ? healthy.reduce((best, row) =>
          row.revenuePerTradingHour > best.revenuePerTradingHour ? row : best,
        ).outletId
      : null;

  return rows.map((row) => ({
    ...row,
    verdict: verdictFor(row, {
      periodDays: options.periodDays,
      benchmarks,
      isLeader: leaderId !== null && row.outletId === leaderId,
    }),
  }));
}
