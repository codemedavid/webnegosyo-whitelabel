import {
  chunkOrderQueries,
  describeOrderCustomerBadge,
  describeOrderStamp,
  toOrderCustomerQuery,
  type OrderCustomerSummary,
} from "./order-customers";
import type { LoyaltyMemberProgress } from "./members";

function headline(overrides: Partial<LoyaltyMemberProgress> = {}): LoyaltyMemberProgress {
  return {
    programId: "p1",
    programName: "Coffee Card",
    programStatus: "active",
    earnMode: "stamp",
    threshold: 10,
    rewardLabel: "Free latte",
    balance: 4,
    lifetimeEarned: 4,
    rewardsIssued: 0,
    rewardsAvailable: 0,
    lastActivityAt: null,
    remaining: 6,
    percent: 40,
    isDormant: false,
    ...overrides,
  };
}

function summary(overrides: Partial<OrderCustomerSummary> = {}): OrderCustomerSummary {
  return {
    orderId: "o-1",
    customerKey: "phone:+639171111111",
    customerId: "c-1",
    name: "Ana Cruz",
    hasProfile: true,
    orderCount: 5,
    totalSpent: 2500,
    isMember: true,
    status: "earning",
    headline: headline(),
    rewardsAvailable: 0,
    stamp: { state: "earned", delta: 1, programId: "p1", programName: "Coffee Card" },
    ...overrides,
  };
}

describe("describeOrderCustomerBadge", () => {
  it("shows the stamp this order earned and where the card now stands", () => {
    expect(describeOrderCustomerBadge(summary())).toEqual({ label: "+1 stamp · 4/10", tone: "success" });
  });

  it("puts a waiting reward first — that is what the cashier must act on", () => {
    const badge = describeOrderCustomerBadge(summary({ rewardsAvailable: 1 }));

    expect(badge).toEqual({ label: "Reward ready", tone: "accent" });
  });

  it("shows the card of a member whose order has not earned yet", () => {
    const badge = describeOrderCustomerBadge(
      summary({ stamp: { state: "pending", delta: 0, programId: null, programName: null } }),
    );

    expect(badge).toEqual({ label: "Member · 4/10", tone: "accent" });
  });

  it("counts points in points", () => {
    const badge = describeOrderCustomerBadge(
      summary({
        headline: headline({ earnMode: "points", balance: 120, threshold: 500 }),
        stamp: { state: "earned", delta: 25, programId: "p1", programName: "Points" },
      }),
    );

    expect(badge.label).toBe("+25 points · 120/500");
  });

  it("names a returning customer with no card by their order count", () => {
    const badge = describeOrderCustomerBadge(
      summary({ isMember: false, headline: null, orderCount: 5, stamp: { state: "none", delta: 0, programId: null, programName: null } }),
    );

    expect(badge).toEqual({ label: "Regular · 5 orders", tone: "neutral" });
  });

  it("calls a single-order profile new, never 'Regular · 1 orders'", () => {
    const badge = describeOrderCustomerBadge(
      summary({ isMember: false, headline: null, orderCount: 1, stamp: { state: "none", delta: 0, programId: null, programName: null } }),
    );

    expect(badge.label).toBe("New customer");
  });
});

describe("describeOrderStamp", () => {
  it("reads an earned stamp out loud", () => {
    expect(describeOrderStamp(summary())).toEqual({
      title: "Earned 1 stamp",
      detail: "On Coffee Card",
      tone: "success",
    });
  });

  it("says a cancelled order handed its stamp back", () => {
    const stamp = describeOrderStamp(
      summary({ stamp: { state: "returned", delta: 0, programId: "p1", programName: "Coffee Card" } }),
    );

    expect(stamp?.title).toBe("Stamp returned");
    expect(stamp?.tone).toBe("warning");
  });

  it("promises the stamp only once the order completes", () => {
    const stamp = describeOrderStamp(
      summary({ stamp: { state: "pending", delta: 0, programId: null, programName: null } }),
    );

    expect(stamp?.title).toBe("Stamp on completion");
  });

  it("says nothing on a store whose card is not running", () => {
    expect(
      describeOrderStamp(summary({ stamp: { state: "none", delta: 0, programId: null, programName: null } }), false),
    ).toBeNull();
  });

  it("says plainly when a finished order earned nothing on a live store", () => {
    const stamp = describeOrderStamp(
      summary({ stamp: { state: "none", delta: 0, programId: null, programName: null } }),
      true,
    );

    expect(stamp?.title).toBe("No stamp on this order");
  });
});

describe("toOrderCustomerQuery", () => {
  it("sends only short text fields, so a page of orders fits one request", () => {
    const query = toOrderCustomerQuery({
      _id: "o-1",
      customerContact: "0917 111 1111",
      status: "pending",
      customerData: {
        "Contact Number": "09171111111",
        payment_proof_url: `https://example.com/${"x".repeat(400)}`,
        items: [{ a: 1 }],
        guests: 4,
      },
    });

    expect(query).toEqual({
      orderId: "o-1",
      contact: "0917 111 1111",
      status: "pending",
      customerData: { "Contact Number": "09171111111" },
    });
  });

  it("tolerates an order with no customer data", () => {
    expect(toOrderCustomerQuery({ _id: "o-2", status: "ready" })).toEqual({
      orderId: "o-2",
      contact: null,
      status: "ready",
      customerData: null,
    });
  });
});

describe("chunkOrderQueries", () => {
  it("splits a long list into request-sized batches", () => {
    const queries = Array.from({ length: 250 }, (_, i) => ({
      orderId: `o-${i}`,
      contact: null,
      status: null,
      customerData: null,
    }));

    expect(chunkOrderQueries(queries).map((chunk) => chunk.length)).toEqual([100, 100, 50]);
  });
});
