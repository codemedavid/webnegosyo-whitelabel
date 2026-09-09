/**
 * How the Drawer screen phrases what it shows.
 *
 * The screen used to make these calls inline beside its JSX: a raw
 * `paymentMethod ?? "Unrecorded"`, a bare `order.status`, a refund total the
 * summary computed and nothing rendered. Pulling the wording here means a
 * cashier's reading of the till is testable without mounting anything.
 */
import {
  DRAWER_COUNTING_OPTIONS,
  countingFromPolicy,
  policyFromCounting,
  describeCounting,
  drawerBreakdown,
  describeDrawerSale,
  describeIntake,
  describeShiftSales,
  type DrawerCounting,
} from "./drawer-view";
import type { DrawerSale } from "./drawer-view";
import type { CounterSalesSummary } from "./pos-sales";

function summary(overrides: Partial<CounterSalesSummary> = {}): CounterSalesSummary {
  return {
    saleCount: 0,
    grossTotal: 0,
    cashTotal: 0,
    nonCashTotal: 0,
    changeGiven: 0,
    refundsPaid: 0,
    ...overrides,
  };
}

function sale(overrides: Partial<DrawerSale> = {}): DrawerSale {
  return { _id: "o1", _creationTime: 0, source: "pos", total: 100, ...overrides };
}

describe("the counting choice", () => {
  it("offers exactly the two things a till can count", () => {
    expect(DRAWER_COUNTING_OPTIONS.map((o) => o.value)).toEqual(["counter", "all"]);
  });

  it("round-trips through the stored boolean the summary already takes", () => {
    const values: DrawerCounting[] = ["counter", "all"];
    values.forEach((value) => {
      expect(countingFromPolicy(policyFromCounting(value))).toBe(value);
    });
    expect(policyFromCounting("counter")).toBe(false);
    expect(policyFromCounting("all")).toBe(true);
  });

  it("says which orders each choice puts in the till", () => {
    expect(describeCounting("counter")).toMatch(/counter/i);
    // The reason online orders are counted at what was PAID, not what was
    // billed, is the one thing a cashier must know before trusting the number.
    expect(describeCounting("all")).toMatch(/paid/i);
  });
});

describe("the money breakdown under the headline", () => {
  it("never repeats the cash headline as a line of its own", () => {
    const lines = drawerBreakdown(summary({ cashTotal: 500 }));
    expect(lines.map((l) => l.key)).not.toContain("cash");
  });

  it("shows what was sold, what did not land in the till, and what was handed back", () => {
    const lines = drawerBreakdown(summary({ grossTotal: 900, nonCashTotal: 400, changeGiven: 60 }));
    expect(lines.map((l) => l.key)).toEqual(["gross", "nonCash", "change"]);
    expect(lines.map((l) => l.value)).toEqual([900, 400, 60]);
  });

  it("adds refunds only when money actually left the till", () => {
    expect(drawerBreakdown(summary()).map((l) => l.key)).not.toContain("refunds");
    const refunded = drawerBreakdown(summary({ refundsPaid: 120 }));
    expect(refunded.map((l) => l.key)).toContain("refunds");
    expect(refunded.find((l) => l.key === "refunds")?.value).toBe(120);
  });
});

describe("one sale in the list", () => {
  it("names the payment method taken", () => {
    expect(describeDrawerSale(sale({ paymentMethod: "Cash" })).meta).toMatch(/Cash/);
  });

  it("calls an unrecorded method what it is, in words a cashier can act on", () => {
    const meta = describeDrawerSale(sale({ paymentMethod: undefined })).meta;
    expect(meta).toMatch(/no payment recorded/i);
  });

  it("reports the change handed back on that sale", () => {
    const row = describeDrawerSale(
      sale({ paymentMethod: "Cash", customerData: { pos: { changeDue: 20 } } }),
    );
    expect(row.meta).toMatch(/20\.00 change/);
  });

  it("leaves change out when none was given", () => {
    expect(describeDrawerSale(sale({ paymentMethod: "Cash" })).meta).not.toMatch(/change/);
  });

  it("marks an order the register did not ring up, so a mixed list stays readable", () => {
    expect(describeDrawerSale(sale({ source: "web" })).tag).toBe("Smart Menu");
    expect(describeDrawerSale(sale({ source: "pos" })).tag).toBeNull();
  });

  it("names the customer when the order carries one", () => {
    expect(describeDrawerSale(sale({ customerName: "Maria" })).who).toBe("Maria");
    expect(describeDrawerSale(sale({ customerName: "   " })).who).toBeNull();
    expect(describeDrawerSale(sale()).who).toBeNull();
  });
});

describe("section wording", () => {
  it("counts what is waiting, in the singular when there is one", () => {
    expect(describeIntake(1)).toMatch(/^1 order\b/);
    expect(describeIntake(3)).toMatch(/^3 orders\b/);
  });

  it("says what the sales list is counting, so the total is never a mystery", () => {
    expect(describeShiftSales(0, "counter")).toMatch(/no sales/i);
    expect(describeShiftSales(2, "counter")).toMatch(/^2 sales/);
    expect(describeShiftSales(1, "counter")).toMatch(/^1 sale\b/);
    expect(describeShiftSales(2, "all")).toMatch(/smart menu/i);
  });
});
