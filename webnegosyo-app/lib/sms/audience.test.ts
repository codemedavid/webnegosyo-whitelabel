import { selectAudience } from "./audience";
import type { SmsCustomer } from "./types";

const NOW = "2026-08-16T02:00:00.000Z"; // 10:00 Manila

function customer(overrides: Partial<SmsCustomer> = {}): SmsCustomer {
  return {
    id: "c1",
    name: "Maria Santos",
    phone_e164: "+639171234567",
    order_count: 3,
    total_spent: 1200,
    last_order_at: "2026-07-01T02:00:00.000Z",
    channels_used: ["pickup"],
    sms_consent: true,
    sms_opt_out: false,
    ...overrides,
  };
}

describe("selectAudience — who may be texted at all", () => {
  it("includes a consented, contactable customer", () => {
    const result = selectAudience([customer()], {}, { now: NOW });

    expect(result.recipients.map((r) => r.id)).toEqual(["c1"]);
    expect(result.excluded).toEqual([]);
  });

  it("excludes a customer with no phone number", () => {
    const result = selectAudience([customer({ phone_e164: null })], {}, { now: NOW });

    expect(result.recipients).toEqual([]);
    expect(result.excluded).toEqual([{ customerId: "c1", reason: "no_phone" }]);
  });

  it("excludes a customer who never opted in", () => {
    const result = selectAudience([customer({ sms_consent: false })], {}, { now: NOW });

    expect(result.excluded).toEqual([{ customerId: "c1", reason: "no_consent" }]);
  });

  it("excludes a customer who opted out even though consent is still true", () => {
    const result = selectAudience(
      [customer({ sms_consent: true, sms_opt_out: true })],
      {},
      { now: NOW }
    );

    expect(result.excluded).toEqual([{ customerId: "c1", reason: "opted_out" }]);
  });

  it("excludes a suppressed number", () => {
    const result = selectAudience([customer()], {}, {
      now: NOW,
      suppressedPhones: ["+639171234567"],
    });

    expect(result.excluded).toEqual([{ customerId: "c1", reason: "suppressed" }]);
  });

  it("excludes a number texted too recently, across campaigns", () => {
    const result = selectAudience([customer()], {}, {
      now: NOW,
      recentlyTextedPhones: ["+639171234567"],
    });

    expect(result.excluded).toEqual([{ customerId: "c1", reason: "recently_texted" }]);
  });

  it("reports one reason per customer, checking eligibility before filters", () => {
    // Opted out AND outside the filter — the honest reason is the opt-out.
    const result = selectAudience(
      [customer({ sms_opt_out: true, order_count: 0 })],
      { minOrderCount: 5 },
      { now: NOW }
    );

    expect(result.excluded).toEqual([{ customerId: "c1", reason: "opted_out" }]);
  });
});

describe("selectAudience — the follow-up filters", () => {
  it("keeps only customers whose last order is older than the win-back window", () => {
    const lapsed = customer({ id: "lapsed", last_order_at: "2026-06-01T02:00:00.000Z" });
    const recent = customer({ id: "recent", last_order_at: "2026-08-14T02:00:00.000Z" });

    const result = selectAudience([lapsed, recent], { lastOrderOlderThanDays: 30 }, { now: NOW });

    expect(result.recipients.map((r) => r.id)).toEqual(["lapsed"]);
    expect(result.excluded).toEqual([{ customerId: "recent", reason: "filter" }]);
  });

  it("keeps only customers who ordered inside a recency window", () => {
    const lapsed = customer({ id: "lapsed", last_order_at: "2026-06-01T02:00:00.000Z" });
    const recent = customer({ id: "recent", last_order_at: "2026-08-14T02:00:00.000Z" });

    const result = selectAudience([lapsed, recent], { lastOrderWithinDays: 30 }, { now: NOW });

    expect(result.recipients.map((r) => r.id)).toEqual(["recent"]);
  });

  it("treats a customer who has never ordered as outside any recency window", () => {
    const never = customer({ id: "never", last_order_at: null });

    expect(
      selectAudience([never], { lastOrderOlderThanDays: 30 }, { now: NOW }).recipients
    ).toEqual([]);
    expect(
      selectAudience([never], { lastOrderWithinDays: 30 }, { now: NOW }).recipients
    ).toEqual([]);
  });

  it("applies minimum order count and minimum spend", () => {
    const regular = customer({ id: "regular", order_count: 10, total_spent: 5000 });
    const oneOff = customer({ id: "oneOff", order_count: 1, total_spent: 150 });

    const result = selectAudience(
      [regular, oneOff],
      { minOrderCount: 5, minTotalSpent: 1000 },
      { now: NOW }
    );

    expect(result.recipients.map((r) => r.id)).toEqual(["regular"]);
  });

  it("matches a customer who used any of the requested channels", () => {
    const delivery = customer({ id: "delivery", channels_used: ["delivery", "pickup"] });
    const dineIn = customer({ id: "dineIn", channels_used: ["dine_in"] });

    const result = selectAudience([delivery, dineIn], { channels: ["delivery"] }, { now: NOW });

    expect(result.recipients.map((r) => r.id)).toEqual(["delivery"]);
  });

  it("combines every filter with AND", () => {
    const match = customer({ id: "match", order_count: 8, last_order_at: "2026-06-01T02:00:00.000Z" });
    const tooFew = customer({ id: "tooFew", order_count: 2, last_order_at: "2026-06-01T02:00:00.000Z" });

    const result = selectAudience(
      [match, tooFew],
      { minOrderCount: 5, lastOrderOlderThanDays: 30 },
      { now: NOW }
    );

    expect(result.recipients.map((r) => r.id)).toEqual(["match"]);
  });

  it("selects everyone eligible when the filter is empty", () => {
    const result = selectAudience([customer({ id: "a" }), customer({ id: "b" })], {}, { now: NOW });

    expect(result.recipients).toHaveLength(2);
  });
});

describe("selectAudience — ordering and reporting", () => {
  it("puts the most recent customers first, so a truncated run reaches the warmest guests", () => {
    const old = customer({ id: "old", last_order_at: "2026-01-01T00:00:00.000Z" });
    const mid = customer({ id: "mid", last_order_at: "2026-05-01T00:00:00.000Z" });
    const fresh = customer({ id: "fresh", last_order_at: "2026-08-01T00:00:00.000Z" });

    const result = selectAudience([old, fresh, mid], {}, { now: NOW });

    expect(result.recipients.map((r) => r.id)).toEqual(["fresh", "mid", "old"]);
  });

  it("summarizes why people were left out, for the pre-send review screen", () => {
    const result = selectAudience(
      [
        customer({ id: "ok" }),
        customer({ id: "noPhone", phone_e164: null }),
        customer({ id: "noConsent", sms_consent: false }),
        customer({ id: "alsoNoConsent", sms_consent: false }),
      ],
      {},
      { now: NOW }
    );

    expect(result.recipients).toHaveLength(1);
    expect(result.summary.no_phone).toBe(1);
    expect(result.summary.no_consent).toBe(2);
    expect(result.summary.opted_out).toBe(0);
  });

  it("never mutates the customers it was given", () => {
    const input = [customer({ id: "b" }), customer({ id: "a" })];
    const snapshot = JSON.parse(JSON.stringify(input));

    selectAudience(input, { minOrderCount: 1 }, { now: NOW });

    expect(input).toEqual(snapshot);
  });

  it("returns an empty audience rather than throwing on an empty customer list", () => {
    const result = selectAudience([], {}, { now: NOW });

    expect(result.recipients).toEqual([]);
    expect(result.summary.no_phone).toBe(0);
  });
});
