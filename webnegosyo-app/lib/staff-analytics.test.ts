/**
 * Who sold what, person by person.
 *
 * The owner's question is comparative — "how did Ana's register do against
 * Ben's this week" — so the unit is the person, the window is whole Manila
 * days (the branch-period rule: rolling windows make every edge day
 * permanently short), and the arithmetic is pos-sales' own, so a peso here
 * is the same peso the drawer screen shows.
 *
 * Sales nobody is stamped on land in an explicit "unattributed" bucket
 * rather than vanishing: totals that silently exclude rows read as a store
 * that sold less, not as a report that dropped data.
 */

import type { CounterSale } from "./pos-sales";
import { summarizeStaffPerformance } from "./staff-analytics";

const DAY_START = Date.parse("2026-08-20T00:00:00+08:00");
const HOUR = 60 * 60 * 1000;
const PERIOD = { startMs: DAY_START, endMs: DAY_START + 24 * HOUR - 1 };

function sale(overrides: Partial<CounterSale>): CounterSale {
  return {
    _id: Math.random().toString(36).slice(2),
    _creationTime: DAY_START + 2 * HOUR,
    source: "pos",
    status: "delivered",
    total: 100,
    paymentMethod: "Cash",
    customerData: { pos: { cashierId: "u1" } },
    ...overrides,
  };
}

describe("summarizeStaffPerformance", () => {
  it("groups sales by the cashier stamped on them", () => {
    const rows = summarizeStaffPerformance(
      [
        sale({ total: 100 }),
        sale({ total: 50, paymentMethod: "GCash" }),
        sale({ total: 30, customerData: { pos: { cashierId: "u2" } } }),
      ],
      [],
      PERIOD,
    );

    const ana = rows.staff.find((r) => r.staffUserId === "u1");
    const ben = rows.staff.find((r) => r.staffUserId === "u2");
    expect(ana?.saleCount).toBe(2);
    expect(ana?.grossTotal).toBe(150);
    expect(ana?.cashTotal).toBe(100);
    expect(ana?.nonCashTotal).toBe(50);
    expect(ben?.saleCount).toBe(1);
    expect(ben?.grossTotal).toBe(30);
  });

  it("ranks the busiest register first", () => {
    const rows = summarizeStaffPerformance(
      [
        sale({ total: 10, customerData: { pos: { cashierId: "u2" } } }),
        sale({ total: 100 }),
        sale({ total: 100 }),
      ],
      [],
      PERIOD,
    );
    expect(rows.staff.map((r) => r.staffUserId)).toEqual(["u1", "u2"]);
  });

  it("computes the average ticket per person", () => {
    const rows = summarizeStaffPerformance(
      [sale({ total: 100 }), sale({ total: 50 })],
      [],
      PERIOD,
    );
    expect(rows.staff[0].averageTicket).toBe(75);
  });

  it("drops sales outside the window", () => {
    const rows = summarizeStaffPerformance(
      [
        sale({ _creationTime: PERIOD.startMs - 1 }),
        sale({ _creationTime: PERIOD.endMs + 1 }),
        sale({ total: 42 }),
      ],
      [],
      PERIOD,
    );
    expect(rows.staff[0].saleCount).toBe(1);
    expect(rows.staff[0].grossTotal).toBe(42);
  });

  it("drops cancelled sales and online orders — not a register's work", () => {
    const rows = summarizeStaffPerformance(
      [
        sale({ status: "cancelled" }),
        sale({ source: "web", customerData: {} }),
        sale({ total: 42 }),
      ],
      [],
      PERIOD,
    );
    expect(rows.staff).toHaveLength(1);
    expect(rows.staff[0].saleCount).toBe(1);
  });

  it("collects unattributed counter sales into their own bucket", () => {
    const rows = summarizeStaffPerformance(
      [sale({ customerData: { pos: {} }, total: 77 }), sale({ total: 10 })],
      [],
      PERIOD,
    );
    expect(rows.unattributed.saleCount).toBe(1);
    expect(rows.unattributed.grossTotal).toBe(77);
    // And they must not leak into anyone's personal column.
    expect(rows.staff.find((r) => r.staffUserId === "u1")?.grossTotal).toBe(10);
  });

  it("hands each person their own settlement rows, nobody else's", () => {
    // An edited bill's cash top-up must land on the register that took it.
    const a = sale({ _id: "a", total: 120, paymentMethod: "GCash" });
    const b = sale({ _id: "b", total: 50, customerData: { pos: { cashierId: "u2" } } });
    const rows = summarizeStaffPerformance(
      [a, b],
      [
        { orderId: "a", kind: "charge", amount: 100, paymentMethodName: "GCash" },
        { orderId: "a", kind: "charge", amount: 20, paymentMethodName: "Cash" },
        { orderId: "b", kind: "refund", amount: 50, paymentMethodName: "Cash" },
      ],
      PERIOD,
    );

    const ana = rows.staff.find((r) => r.staffUserId === "u1");
    const ben = rows.staff.find((r) => r.staffUserId === "u2");
    expect(ana?.cashTotal).toBe(20);
    expect(ana?.nonCashTotal).toBe(100);
    expect(ben?.refundsPaid).toBe(50);
  });

  it("returns empty results for an empty day, not a crash", () => {
    const rows = summarizeStaffPerformance([], [], PERIOD);
    expect(rows.staff).toEqual([]);
    expect(rows.unattributed.saleCount).toBe(0);
  });
});

it("credits sales to their seller and cash to their collector without duplicating gross", () => {
  const order = sale({ _id: "bill", total: 100 });
  const result = summarizeStaffPerformance([order], [
    { orderId: "bill", kind: "charge", amount: 100, paymentMethodName: "Cash", recordedBy: "u2", _creationTime: DAY_START + 3 * HOUR },
  ], PERIOD);
  expect(result.staff.find(row => row.staffUserId === "u1")).toMatchObject({ grossTotal: 100, saleCount: 1, cashTotal: 0 });
  expect(result.staff.find(row => row.staffUserId === "u2")).toMatchObject({ grossTotal: 0, saleCount: 0, cashTotal: 100 });
});
