import { buildSummaryModel, type SummaryInput } from "./summary-model";
import type { StoreActivitySummary } from "./store-event";
import { activityEvent } from "./test-fixtures";

function summary(partial: Partial<StoreActivitySummary> = {}): StoreActivitySummary {
  return { byKind: [], byActor: [], byDay: [], routine: [], flaggedOpen: 0, ...partial };
}

function baselineDays(count: number): StoreActivitySummary["byDay"] {
  return Array.from({ length: count }, (_, index) => ({
    day: `2026-09-${String(index + 1).padStart(2, "0")}`,
    kind: "shift.opened" as const,
    count: 1,
    amount: null,
  }));
}

function input(partial: Partial<SummaryInput> = {}): SummaryInput {
  return {
    current: summary(),
    baseline: null,
    rows: [],
    isRowsPartial: false,
    sales: null,
    baselineSales: null,
    ...partial,
  };
}

describe("buildSummaryModel — money that didn't stay", () => {
  it("adds refunds, paid cancels, manual discounts and waste — and never Senior/PWD", () => {
    const model = buildSummaryModel(
      input({
        current: summary({
          byKind: [
            { kind: "refund.issued", statutory: false, count: 2, amount: -185, quantity: null },
            { kind: "discount.applied", statutory: false, count: 1, amount: -50, quantity: null },
            { kind: "discount.applied", statutory: true, count: 3, amount: -610, quantity: null },
            { kind: "stock.wasted", statutory: false, count: 1, amount: -640, quantity: 2 },
            { kind: "voucher.redeemed", statutory: false, count: 4, amount: -420, quantity: null },
            { kind: "loyalty.reward_claimed", statutory: false, count: 2, amount: -285, quantity: null },
          ],
        }),
        rows: [
          activityEvent("order.cancelled", { amount: 310, summary: { amountPaid: 310 } }),
          activityEvent("order.cancelled", { amount: 200, summary: {} }),
        ],
        sales: 72_000,
      }),
    );

    expect(model.leak.amount).toBe(185 + 310 + 50 + 640);
    // Rates leave paid cancels out (the baseline cannot tell them apart).
    expect(model.leak.percentOfSales).toBeCloseTo(1.215, 2);
    expect(model.stats.map((stat) => [stat.label, stat.value, stat.hint])).toEqual([
      ["Refunded", "₱185", "2 refunds"],
      ["Cancelled after paying", "₱310", "1 order"],
      ["Discounts", "₱50", "1 discount"],
      ["Stock wasted", "₱640", "at cost"],
    ]);
    expect(model.givenAway).toBe("Vouchers ₱420 · Rewards ₱285 · Senior/PWD ₱610");
  });

  it("says a paid-cancel figure is a floor when the rows were cut off", () => {
    const model = buildSummaryModel(
      input({ rows: [activityEvent("order.cancelled", { summary: { amountPaid: 100 } })], isRowsPartial: true }),
    );
    expect(model.stats[1].value).toBe("₱100+");
  });

  it("compares with the store's usual rate only with 14 days of history", () => {
    const current = summary({ byKind: [{ kind: "refund.issued", statutory: false, count: 1, amount: -200, quantity: null }] });
    const thin = buildSummaryModel(input({ current, sales: 10_000, baseline: summary({ byDay: baselineDays(5) }), baselineSales: 50_000 }));
    expect(thin.leak.comparison).toBe("not_enough_history");

    const baseline = summary({
      byDay: baselineDays(20),
      byKind: [{ kind: "refund.issued", statutory: false, count: 3, amount: -500, quantity: null }],
    });
    const above = buildSummaryModel(input({ current, sales: 10_000, baseline, baselineSales: 100_000 }));
    expect(above.leak.comparison).toBe("above");
    expect(above.leak.usualPercent).toBeCloseTo(0.5, 5);

    const normal = buildSummaryModel(input({ current, sales: 100_000, baseline, baselineSales: 100_000 }));
    expect(normal.leak.comparison).toBe("normal");
  });

  it("reports no comparison without sales", () => {
    expect(buildSummaryModel(input()).leak.comparison).toBe("no_sales");
  });
});

describe("buildSummaryModel — drawers", () => {
  it("counts closed shifts and lists the ones that were off", () => {
    const model = buildSummaryModel(
      input({
        rows: [
          activityEvent("shift.closed", { id: "s1", amount: -100, actorName: "Jomar Diaz" }),
          activityEvent("shift.closed", { id: "s2", amount: 0 }),
          activityEvent("shift.closed", { id: "s3", amount: 0.004 }),
        ],
      }),
    );
    expect(model.drawers.line).toBe("3 shifts closed · 1 short ₱100 · 2 exact");
    expect(model.drawers.offRows.map((row) => [row.eventId, row.label])).toEqual([["s1", "Jomar · short ₱100"]]);
  });

  it("is quiet when no shift closed", () => {
    expect(buildSummaryModel(input()).drawers.line).toBeNull();
  });
});

describe("buildSummaryModel — all clear and empty", () => {
  it("is all clear only when nothing left and every drawer matched", () => {
    const clean = buildSummaryModel(
      input({ current: summary({ byKind: [{ kind: "shift.closed", statutory: false, count: 1, amount: 0, quantity: null }] }), rows: [activityEvent("shift.closed", { amount: 0 })] }),
    );
    expect(clean.isAllClear).toBe(true);
    expect(clean.isEmpty).toBe(false);

    const short = buildSummaryModel(input({ rows: [activityEvent("shift.closed", { amount: -100 })] }));
    expect(short.isAllClear).toBe(false);
  });

  it("is empty when nothing at all was recorded", () => {
    const model = buildSummaryModel(input());
    expect(model.isEmpty).toBe(true);
    expect(model.isAllClear).toBe(false);
  });
});
