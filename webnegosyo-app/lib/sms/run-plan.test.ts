import { planRun } from "./run-plan";
import type { SmsCustomer } from "./types";

function customer(id: string): SmsCustomer {
  return {
    id,
    name: `Guest ${id}`,
    phone_e164: `+63917000${id.padStart(4, "0")}`,
    order_count: 1,
    total_spent: 100,
    last_order_at: "2026-07-01T02:00:00.000Z",
    channels_used: ["pickup"],
    sms_consent: true,
    sms_opt_out: false,
  };
}

const TEN = Array.from({ length: 10 }, (_, i) => customer(String(i + 1)));

describe("planRun", () => {
  it("sends everyone when the audience fits under the cap", () => {
    const plan = planRun(TEN.slice(0, 3), { alreadySentCustomerIds: [], maxPerRun: 25 });

    expect(plan.batch.map((c) => c.id)).toEqual(["1", "2", "3"]);
    expect(plan.deferred).toEqual([]);
    expect(plan.isComplete).toBe(true);
  });

  it("caps the batch and defers the rest — Android throttles bulk SMS", () => {
    const plan = planRun(TEN, { alreadySentCustomerIds: [], maxPerRun: 4 });

    expect(plan.batch).toHaveLength(4);
    expect(plan.deferred).toHaveLength(6);
    expect(plan.isComplete).toBe(false);
  });

  it("preserves audience order, so the warmest guests are reached first", () => {
    const plan = planRun(TEN, { alreadySentCustomerIds: [], maxPerRun: 2 });

    expect(plan.batch.map((c) => c.id)).toEqual(["1", "2"]);
    expect(plan.deferred[0].id).toBe("3");
  });

  it("skips customers already texted in this run, so a resume never doubles up", () => {
    const plan = planRun(TEN.slice(0, 5), {
      alreadySentCustomerIds: ["1", "3"],
      maxPerRun: 25,
    });

    expect(plan.batch.map((c) => c.id)).toEqual(["2", "4", "5"]);
    expect(plan.alreadySentCount).toBe(2);
  });

  it("counts the cap against the remaining work, not the original audience", () => {
    const plan = planRun(TEN, { alreadySentCustomerIds: ["1", "2", "3"], maxPerRun: 4 });

    expect(plan.batch.map((c) => c.id)).toEqual(["4", "5", "6", "7"]);
    expect(plan.deferred).toHaveLength(3);
  });

  it("reports a finished run when every recipient has already been sent to", () => {
    const plan = planRun(TEN.slice(0, 2), {
      alreadySentCustomerIds: ["1", "2"],
      maxPerRun: 25,
    });

    expect(plan.batch).toEqual([]);
    expect(plan.isComplete).toBe(true);
  });

  it("handles an empty audience without throwing", () => {
    const plan = planRun([], { alreadySentCustomerIds: [], maxPerRun: 25 });

    expect(plan.batch).toEqual([]);
    expect(plan.isComplete).toBe(true);
  });

  it("never mutates the audience it was given", () => {
    const input = TEN.slice(0, 3);
    const snapshot = JSON.parse(JSON.stringify(input));

    planRun(input, { alreadySentCustomerIds: ["1"], maxPerRun: 1 });

    expect(input).toEqual(snapshot);
  });
});
