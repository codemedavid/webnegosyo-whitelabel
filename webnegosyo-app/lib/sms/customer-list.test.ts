import { buildCustomerList, customerReachability } from "./customer-list";
import type { SmsCustomer } from "./types";

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

describe("customerReachability — the badge on each row", () => {
  it("marks a consented, contactable customer as textable", () => {
    expect(customerReachability(customer(), [])).toEqual({
      status: "textable",
      label: "Can text",
    });
  });

  it("marks a customer who never opted in", () => {
    expect(customerReachability(customer({ sms_consent: false }), []).status).toBe("no_consent");
  });

  it("marks an opt-out ahead of a missing consent, because it is the stronger signal", () => {
    const both = customer({ sms_consent: false, sms_opt_out: true });

    expect(customerReachability(both, []).status).toBe("opted_out");
  });

  it("marks a suppressed number", () => {
    expect(customerReachability(customer(), ["+639171234567"]).status).toBe("suppressed");
  });

  it("marks a customer with no phone as unreachable regardless of consent", () => {
    expect(customerReachability(customer({ phone_e164: null }), []).status).toBe("no_phone");
  });
});

describe("buildCustomerList — the screen must show the whole database", () => {
  const people = [
    customer({ id: "a", name: "Ana Cruz", phone_e164: "+639170000001", sms_consent: false }),
    customer({ id: "b", name: "Ben Reyes", phone_e164: "+639170000002", sms_consent: true }),
    customer({ id: "c", name: "Carla Diaz", phone_e164: null, sms_consent: false }),
  ];

  it("lists every customer, not only the ones who can be texted", () => {
    // The merchant asked to see their customer database. Hiding the 99% who
    // have not opted in yet makes the screen look broken and empty.
    const list = buildCustomerList(people, { query: "", filter: "all", suppressedPhones: [] });

    expect(list.rows).toHaveLength(3);
  });

  it("counts how many are actually textable, so the number is never a surprise", () => {
    const list = buildCustomerList(people, { query: "", filter: "all", suppressedPhones: [] });

    expect(list.stats).toEqual({ total: 3, textable: 1, noConsent: 1, optedOut: 0, noPhone: 1 });
  });

  it("narrows to the textable ones when asked", () => {
    const list = buildCustomerList(people, {
      query: "",
      filter: "textable",
      suppressedPhones: [],
    });

    expect(list.rows.map((r) => r.customer.id)).toEqual(["b"]);
  });

  it("searches by name, case-insensitively", () => {
    const list = buildCustomerList(people, {
      query: "ben",
      filter: "all",
      suppressedPhones: [],
    });

    expect(list.rows.map((r) => r.customer.id)).toEqual(["b"]);
  });

  it("searches by phone number, ignoring how the merchant types it", () => {
    // The merchant reads "0917 000 0002" off a receipt; the row is +639170000002.
    const list = buildCustomerList(people, {
      query: "0917 000 0002",
      filter: "all",
      suppressedPhones: [],
    });

    expect(list.rows.map((r) => r.customer.id)).toEqual(["b"]);
  });

  it("returns an explicit empty result rather than every row for an unmatched search", () => {
    const list = buildCustomerList(people, {
      query: "zzzz",
      filter: "all",
      suppressedPhones: [],
    });

    expect(list.rows).toEqual([]);
    expect(list.stats.total).toBe(3);
  });

  it("sorts most-recent-order first", () => {
    const list = buildCustomerList(
      [
        customer({ id: "old", last_order_at: "2026-01-01T00:00:00.000Z" }),
        customer({ id: "new", last_order_at: "2026-08-01T00:00:00.000Z" }),
      ],
      { query: "", filter: "all", suppressedPhones: [] }
    );

    expect(list.rows.map((r) => r.customer.id)).toEqual(["new", "old"]);
  });

  it("keeps stats over the whole database even while a search is narrowing the rows", () => {
    const list = buildCustomerList(people, {
      query: "ben",
      filter: "all",
      suppressedPhones: [],
    });

    expect(list.rows).toHaveLength(1);
    expect(list.stats.total).toBe(3);
  });

  it("handles an empty database without throwing", () => {
    const list = buildCustomerList([], { query: "", filter: "all", suppressedPhones: [] });

    expect(list.rows).toEqual([]);
    expect(list.stats.total).toBe(0);
  });
});
