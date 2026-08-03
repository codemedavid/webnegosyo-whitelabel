/**
 * Reads and writes behind customer management.
 *
 * These pin the things that are invisible from the screen and expensive when
 * wrong: that every read *and every write* carries an explicit tenant filter
 * (RLS alone leaks the whole platform's guest list to an impersonating
 * superadmin — a leak this codebase has shipped before), that a failed read
 * throws rather than resolving to an empty list that renders as "no customers
 * yet", and that a duplicate phone comes back as something the merchant can act
 * on instead of a raw Postgres constraint code.
 */

const calls: { method: string; args: unknown[] }[] = [];
let queued: { data: unknown; error: unknown }[] = [];

function nextResult(): { data: unknown; error: unknown } {
  return queued.shift() ?? { data: [], error: null };
}

jest.mock("../supabase", () => {
  const makeChain = () => {
    const chain: Record<string, unknown> = {};
    for (const method of [
      "select",
      "insert",
      "update",
      "eq",
      "or",
      "ilike",
      "order",
      "range",
      "limit",
      "maybeSingle",
      "single",
    ]) {
      chain[method] = (...args: unknown[]) => {
        calls.push({ method, args });
        return chain;
      };
    }
    chain.then = (resolve: (value: unknown) => unknown) => resolve(nextResult());
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => {
        calls.push({ method: "from", args: [table] });
        return makeChain();
      },
    },
  };
});

import {
  listCustomers,
  getCustomer,
  findCustomerByPhone,
  createCustomer,
  updateCustomer,
  DuplicateCustomerError,
} from "./repo";

beforeEach(() => {
  calls.length = 0;
  queued = [];
});

function argsFor(method: string): unknown[][] {
  return calls.filter((c) => c.method === method).map((c) => c.args);
}

const ROW = {
  id: "c1",
  name: "Maria Santos",
  phone_e164: "+639171234567",
  email: null,
  notes: "Allergic to shrimp",
  created_source: "manual",
  order_count: 3,
  total_spent: 1500,
  average_order_value: 500,
  first_order_at: "2026-01-01T00:00:00Z",
  last_order_at: "2026-08-01T00:00:00Z",
  channels_used: ["dine_in"],
  sms_consent: true,
  sms_opt_out: false,
};

describe("listCustomers", () => {
  it("scopes the read to the tenant explicitly, never relying on RLS alone", async () => {
    queued = [{ data: [ROW], error: null }];

    await listCustomers("t1");

    expect(argsFor("eq")).toContainEqual(["tenant_id", "t1"]);
  });

  it("throws when the read fails instead of returning an empty list", async () => {
    // An empty array here is indistinguishable from a genuinely empty store,
    // so a broken query would silently render as "no customers yet".
    queued = [{ data: null, error: { message: "boom" } }];

    await expect(listCustomers("t1")).rejects.toThrow(/boom/);
  });

  it("maps a row into the record the screen consumes", async () => {
    queued = [{ data: [ROW], error: null }];

    const [customer] = await listCustomers("t1");

    expect(customer).toEqual({
      id: "c1",
      name: "Maria Santos",
      phoneE164: "+639171234567",
      email: null,
      notes: "Allergic to shrimp",
      createdSource: "manual",
      orderCount: 3,
      totalSpent: 1500,
      averageOrderValue: 500,
      firstOrderAt: "2026-01-01T00:00:00Z",
      lastOrderAt: "2026-08-01T00:00:00Z",
      channelsUsed: ["dine_in"],
      smsConsent: true,
      smsOptOut: false,
    });
  });

  it.each([
    ["recent", "last_order_at"],
    ["top_spend", "total_spent"],
    ["frequent", "order_count"],
  ])("sorts %s by %s descending", async (sort, column) => {
    queued = [{ data: [], error: null }];

    await listCustomers("t1", { sort: sort as "recent" });

    expect(argsFor("order")).toContainEqual([
      column,
      { ascending: false, nullsFirst: false },
    ]);
  });

  it("matches a phone-shaped search against the normalized phone column", async () => {
    // The merchant types what is printed on the receipt (0917...), but the
    // column holds E.164. Searching the raw string would never match.
    queued = [{ data: [], error: null }];

    await listCustomers("t1", { search: "0917 123 4567" });

    const or = argsFor("or")[0]?.[0] as string;
    expect(or).toContain("+639171234567");
  });

  it("falls back to a name search when the query is not a phone", async () => {
    queued = [{ data: [], error: null }];

    await listCustomers("t1", { search: "maria" });

    expect(argsFor("ilike")).toContainEqual(["name", "%maria%"]);
  });
});

describe("getCustomer", () => {
  it("scopes to the tenant as well as the id", async () => {
    // Filtering by id alone would let a guessed uuid read another store's guest.
    queued = [{ data: ROW, error: null }];

    await getCustomer("t1", "c1");

    expect(argsFor("eq")).toContainEqual(["tenant_id", "t1"]);
    expect(argsFor("eq")).toContainEqual(["id", "c1"]);
  });

  it("returns null when no such customer exists", async () => {
    queued = [{ data: null, error: null }];

    await expect(getCustomer("t1", "nope")).resolves.toBeNull();
  });
});

describe("findCustomerByPhone", () => {
  it("looks up the tenant's existing guest before a create", async () => {
    queued = [{ data: ROW, error: null }];

    const found = await findCustomerByPhone("t1", "+639171234567");

    expect(argsFor("eq")).toContainEqual(["tenant_id", "t1"]);
    expect(argsFor("eq")).toContainEqual(["phone_e164", "+639171234567"]);
    expect(found?.id).toBe("c1");
  });
});

describe("createCustomer", () => {
  const draft = {
    name: "Maria Santos",
    phoneE164: "+639171234567",
    email: null,
    notes: null,
  };

  it("stamps the row as manually created", async () => {
    // Without this, a hand-entered guest with no orders yet is indistinguishable
    // from a derived row whose order rollup failed.
    queued = [{ data: ROW, error: null }];

    await createCustomer("t1", draft);

    const inserted = argsFor("insert")[0]?.[0] as Record<string, unknown>;
    expect(inserted.created_source).toBe("manual");
  });

  it("writes the tenant id onto the row", async () => {
    queued = [{ data: ROW, error: null }];

    await createCustomer("t1", draft);

    const inserted = argsFor("insert")[0]?.[0] as Record<string, unknown>;
    expect(inserted.tenant_id).toBe("t1");
  });

  it("does not seed order totals", async () => {
    // A manual guest has ordered nothing. Writing totals here would put a
    // number on screen that no order supports, and the derived recompute
    // would later overwrite it anyway.
    queued = [{ data: ROW, error: null }];

    await createCustomer("t1", draft);

    const inserted = argsFor("insert")[0]?.[0] as Record<string, unknown>;
    expect(inserted).not.toHaveProperty("order_count");
    expect(inserted).not.toHaveProperty("total_spent");
  });

  it("surfaces a duplicate phone as DuplicateCustomerError", async () => {
    // The partial unique index is the real backstop; this turns 23505 into
    // something the screen can offer to open the existing guest instead.
    queued = [{ data: null, error: { code: "23505", message: "duplicate key" } }];

    await expect(createCustomer("t1", draft)).rejects.toBeInstanceOf(
      DuplicateCustomerError
    );
  });

  it("rethrows any other failure", async () => {
    queued = [{ data: null, error: { code: "42501", message: "permission denied" } }];

    await expect(createCustomer("t1", draft)).rejects.toThrow(/permission denied/);
  });
});

describe("updateCustomer", () => {
  it("scopes the write to the tenant, not just the id", async () => {
    // A write filtered by id alone would let one store edit another's guest;
    // RLS should stop it, but the filter is what makes that a guarantee.
    queued = [{ data: ROW, error: null }];

    await updateCustomer("t1", "c1", {
      name: "Maria",
      phoneE164: "+639171234567",
      email: null,
      notes: null,
    });

    expect(argsFor("eq")).toContainEqual(["tenant_id", "t1"]);
    expect(argsFor("eq")).toContainEqual(["id", "c1"]);
  });

  it("never rewrites created_source", async () => {
    // Editing a derived guest must not relabel them as manually created.
    queued = [{ data: ROW, error: null }];

    await updateCustomer("t1", "c1", {
      name: "Maria",
      phoneE164: "+639171234567",
      email: null,
      notes: null,
    });

    const patch = argsFor("update")[0]?.[0] as Record<string, unknown>;
    expect(patch).not.toHaveProperty("created_source");
  });

  it("surfaces a duplicate phone as DuplicateCustomerError", async () => {
    queued = [{ data: null, error: { code: "23505", message: "duplicate key" } }];

    await expect(
      updateCustomer("t1", "c1", {
        name: "Maria",
        phoneE164: "+639171234567",
        email: null,
        notes: null,
      })
    ).rejects.toBeInstanceOf(DuplicateCustomerError);
  });
});
