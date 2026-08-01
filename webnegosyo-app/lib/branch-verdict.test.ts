/**
 * One verdict per branch — the thing that makes the screen usable.
 *
 * Five KPIs across four branches is twenty numbers. An owner standing in a
 * kitchen does not rank twenty numbers; they want to be told which branch to
 * touch and what to do to it. These tests pin that reduction: exactly one
 * verdict per branch, chosen in a fixed fix-order, and exactly one branch ever
 * told to scale.
 *
 * The fix-order is the opinion being tested:
 *   leak → customers → ticket size → repeat → scale
 * Cancellations come first because that is money already earned being thrown
 * away — the cheapest possible fix. Volume before ticket size, and ticket size
 * before loyalty, follows the Hormozi ordering the Growth tab already uses
 * (`diagnoseGrowth`), whose thresholds this module reuses rather than restates.
 */

import { assignBranchVerdicts, verdictFor, DEFAULT_VERDICT_BENCHMARKS } from "./branch-verdict";
import type { BranchKpis } from "./branch-kpis";

const PERIOD_DAYS = 7;

/** A branch clearing every benchmark comfortably. */
function healthyRow(overrides: Partial<BranchKpis> = {}): BranchKpis {
  return {
    outletId: "makati",
    outletName: "Makati",
    revenue: 140_000,
    // 20 orders/day over the week — well past the volume floor.
    orderCount: 140,
    averageOrderValue: 1_000,
    revenueShare: 0.5,
    repeatRate: 0.4,
    identifiedShare: 0.9,
    tradingHours: 70,
    revenuePerTradingHour: 2_000,
    cancelledCount: 0,
    lostRevenue: 0,
    cancellationRate: 0,
    dailyRevenue: [20_000, 20_000, 20_000, 20_000, 20_000, 20_000, 20_000],
    previousRevenue: 120_000,
    revenueDelta: 0.166,
    ...overrides,
  };
}

describe("verdictFor — fix-order", () => {
  it("says nothing definite about a branch with no orders", () => {
    const verdict = verdictFor(healthyRow({ orderCount: 0, revenue: 0 }), {
      periodDays: PERIOD_DAYS,
    });

    expect(verdict.kind).toBe("no-data");
  });

  it("calls out the cancellation leak first, even on a busy branch", () => {
    // Volume and ticket size are fine; one in five orders is being cancelled.
    const verdict = verdictFor(
      healthyRow({ cancelledCount: 35, cancellationRate: 0.2, lostRevenue: 35_000 }),
      { periodDays: PERIOD_DAYS },
    );

    expect(verdict.kind).toBe("leak");
    expect(verdict.tone).toBe("bad");
  });

  it("asks for customers when the branch is too quiet", () => {
    const verdict = verdictFor(healthyRow({ orderCount: 14, revenue: 14_000 }), {
      periodDays: PERIOD_DAYS,
    });

    expect(verdict.kind).toBe("customers");
  });

  it("asks for a bigger ticket when volume is fine but the ticket is small", () => {
    const verdict = verdictFor(healthyRow({ averageOrderValue: 90 }), {
      periodDays: PERIOD_DAYS,
    });

    expect(verdict.kind).toBe("aov");
  });

  it("asks for repeat guests once volume and ticket size are healthy", () => {
    const verdict = verdictFor(healthyRow({ repeatRate: 0.05 }), { periodDays: PERIOD_DAYS });

    expect(verdict.kind).toBe("repeat");
  });

  it("puts volume ahead of ticket size, and ticket size ahead of loyalty", () => {
    // All three are failing at once — only the first in fix-order is reported.
    const failingAll = healthyRow({
      orderCount: 7,
      revenue: 700,
      averageOrderValue: 100,
      repeatRate: 0,
    });

    expect(verdictFor(failingAll, { periodDays: PERIOD_DAYS }).kind).toBe("customers");
    expect(
      verdictFor({ ...failingAll, orderCount: 140, revenue: 14_000 }, { periodDays: PERIOD_DAYS })
        .kind,
    ).toBe("aov");
  });

  it("holds back the repeat verdict when it knows too few of the branch's guests", () => {
    // A counter-heavy branch: almost every order is anonymous, so a low repeat
    // rate says nothing about loyalty. Judging it would send the owner chasing
    // a number the data cannot support.
    const verdict = verdictFor(healthyRow({ repeatRate: 0, identifiedShare: 0.05 }), {
      periodDays: PERIOD_DAYS,
    });

    expect(verdict.kind).not.toBe("repeat");
  });

  it("marks a healthy branch steady, and only the leader as the one to scale", () => {
    expect(verdictFor(healthyRow(), { periodDays: PERIOD_DAYS }).kind).toBe("steady");
    expect(verdictFor(healthyRow(), { periodDays: PERIOD_DAYS, isLeader: true }).kind).toBe("scale");
  });

  it("does not crown a leader that is failing a benchmark", () => {
    const verdict = verdictFor(healthyRow({ averageOrderValue: 90 }), {
      periodDays: PERIOD_DAYS,
      isLeader: true,
    });

    expect(verdict.kind).toBe("aov");
  });

  it("names the unassigned bucket as a data problem, not a branch to manage", () => {
    const verdict = verdictFor(healthyRow({ outletId: null, outletName: "Unassigned" }), {
      periodDays: PERIOD_DAYS,
    });

    expect(verdict.kind).toBe("unattributed");
  });

  it("carries copy an owner can act on", () => {
    const verdict = verdictFor(healthyRow({ repeatRate: 0.05 }), { periodDays: PERIOD_DAYS });

    expect(verdict.label.length).toBeGreaterThan(0);
    expect(verdict.action.length).toBeGreaterThan(0);
  });

  it("honours overridden benchmarks", () => {
    const strict = { ...DEFAULT_VERDICT_BENCHMARKS, minAov: 5_000 };

    expect(verdictFor(healthyRow(), { periodDays: PERIOD_DAYS, benchmarks: strict }).kind).toBe(
      "aov",
    );
  });
});

describe("assignBranchVerdicts", () => {
  it("gives every row a verdict and crowns at most one branch", () => {
    const rows = [
      healthyRow({ outletId: "makati", outletName: "Makati", revenuePerTradingHour: 2_000 }),
      healthyRow({ outletId: "pasig", outletName: "Pasig", revenuePerTradingHour: 1_500 }),
      healthyRow({ outletId: "cebu", outletName: "Cebu", revenuePerTradingHour: 900 }),
    ];

    const assigned = assignBranchVerdicts(rows, { periodDays: PERIOD_DAYS });

    expect(assigned).toHaveLength(3);
    expect(assigned.filter((row) => row.verdict.kind === "scale")).toHaveLength(1);
    expect(assigned.find((row) => row.verdict.kind === "scale")?.outletId).toBe("makati");
    expect(assigned.filter((row) => row.verdict.kind === "steady")).toHaveLength(2);
  });

  it("crowns the best healthy branch, not the best branch overall", () => {
    // Cebu earns the most per hour but is leaking; the crown passes to Pasig.
    const rows = [
      healthyRow({
        outletId: "cebu",
        outletName: "Cebu",
        revenuePerTradingHour: 9_000,
        cancelledCount: 35,
        cancellationRate: 0.2,
      }),
      healthyRow({ outletId: "pasig", outletName: "Pasig", revenuePerTradingHour: 1_500 }),
    ];

    const assigned = assignBranchVerdicts(rows, { periodDays: PERIOD_DAYS });

    expect(assigned.find((row) => row.verdict.kind === "scale")?.outletId).toBe("pasig");
    expect(assigned.find((row) => row.outletId === "cebu")?.verdict.kind).toBe("leak");
  });

  it("crowns nobody when no branch is healthy", () => {
    const rows = [healthyRow({ outletId: "makati", averageOrderValue: 90 })];

    const assigned = assignBranchVerdicts(rows, { periodDays: PERIOD_DAYS });

    expect(assigned.filter((row) => row.verdict.kind === "scale")).toHaveLength(0);
  });

  it("never crowns a single-branch store — there is nothing to compare it to", () => {
    const assigned = assignBranchVerdicts([healthyRow()], { periodDays: PERIOD_DAYS });

    expect(assigned[0].verdict.kind).toBe("steady");
  });

  it("never crowns the unassigned bucket", () => {
    const rows = [
      healthyRow({ outletId: "makati", revenuePerTradingHour: 100 }),
      healthyRow({ outletId: null, outletName: "Unassigned", revenuePerTradingHour: 99_000 }),
    ];

    const assigned = assignBranchVerdicts(rows, { periodDays: PERIOD_DAYS });

    expect(assigned.find((row) => row.outletId === null)?.verdict.kind).toBe("unattributed");
  });

  it("preserves the incoming order of the rows", () => {
    const rows = [
      healthyRow({ outletId: "a", revenuePerTradingHour: 100 }),
      healthyRow({ outletId: "b", revenuePerTradingHour: 900 }),
    ];

    expect(assignBranchVerdicts(rows, { periodDays: PERIOD_DAYS }).map((r) => r.outletId)).toEqual([
      "a",
      "b",
    ]);
  });

  it("handles an empty store", () => {
    expect(assignBranchVerdicts([], { periodDays: PERIOD_DAYS })).toEqual([]);
  });
});
