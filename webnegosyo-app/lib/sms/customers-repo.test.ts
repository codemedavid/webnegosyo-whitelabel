/**
 * Reads and writes behind the Customers screen.
 *
 * What these pin is not "does Supabase work" but the two things that are easy
 * to get wrong and impossible to see from the screen: that the tenant filter is
 * written explicitly rather than left to RLS (a superadmin viewing a store
 * would otherwise pull the whole platform's guest list), and that a failed read
 * throws instead of resolving to an empty array — an empty array here renders
 * as "no customers yet" on top of a database full of them.
 */

const calls: { method: string; args: unknown[] }[] = [];
let queued: { data: unknown; error: unknown }[] = [];

function nextResult(): { data: unknown; error: unknown } {
  return queued.shift() ?? { data: [], error: null };
}

jest.mock("../supabase", () => {
  const makeChain = () => {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "update", "eq", "order", "limit"]) {
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

import { listCustomers, listSuppressedPhones, setCustomerOptOut } from "./customers-repo";

beforeEach(() => {
  calls.length = 0;
  queued = [];
});

function argsFor(method: string): unknown[][] {
  return calls.filter((c) => c.method === method).map((c) => c.args);
}

describe("listCustomers", () => {
  it("scopes the read to the tenant explicitly, never relying on RLS alone", () => {
    queued = [{ data: [], error: null }];

    return listCustomers("tenant-1").then(() => {
      expect(argsFor("eq")).toContainEqual(["tenant_id", "tenant-1"]);
    });
  });

  it("reads from the customers table", async () => {
    queued = [{ data: [], error: null }];

    await listCustomers("tenant-1");

    expect(argsFor("from")).toContainEqual(["customers"]);
  });

  it("names its columns instead of selecting everything", async () => {
    queued = [{ data: [], error: null }];

    await listCustomers("tenant-1");

    const [[columns]] = argsFor("select");
    expect(columns).not.toBe("*");
    expect(String(columns)).toContain("phone_e164");
    expect(String(columns)).toContain("sms_opt_out");
  });

  it("maps a row into the shape the domain modules expect", async () => {
    queued = [
      {
        data: [
          {
            id: "c1",
            name: "Maria",
            phone_e164: "+639171234567",
            order_count: 4,
            total_spent: "1200.50",
            last_order_at: "2026-07-01T02:00:00.000Z",
            channels_used: ["pickup"],
            sms_consent: true,
            sms_opt_out: false,
          },
        ],
        error: null,
      },
    ];

    const [customer] = await listCustomers("tenant-1");

    // Postgres numeric arrives as a string; leaving it would make every spend
    // comparison in the audience filter a string comparison.
    expect(customer.total_spent).toBe(1200.5);
    expect(customer.order_count).toBe(4);
    expect(customer.sms_consent).toBe(true);
  });

  it("defaults a missing channel array rather than handing on undefined", async () => {
    queued = [
      {
        data: [{ id: "c1", name: null, phone_e164: null, channels_used: null }],
        error: null,
      },
    ];

    const [customer] = await listCustomers("tenant-1");

    expect(customer.channels_used).toEqual([]);
    expect(customer.order_count).toBe(0);
    expect(customer.total_spent).toBe(0);
  });

  it("treats a non-boolean consent value as NOT consented", async () => {
    // Fail closed: anything but an explicit true must not become permission
    // to text someone.
    queued = [{ data: [{ id: "c1", sms_consent: "yes", sms_opt_out: null }], error: null }];

    const [customer] = await listCustomers("tenant-1");

    expect(customer.sms_consent).toBe(false);
    expect(customer.sms_opt_out).toBe(false);
  });

  it("throws on a failed read instead of returning an empty list", async () => {
    queued = [{ data: null, error: { message: "permission denied" } }];

    await expect(listCustomers("tenant-1")).rejects.toThrow("permission denied");
  });

  it("returns an empty list when the tenant genuinely has no customers", async () => {
    queued = [{ data: [], error: null }];

    await expect(listCustomers("tenant-1")).resolves.toEqual([]);
  });
});

describe("listSuppressedPhones", () => {
  it("returns the blocked numbers for the tenant", async () => {
    queued = [{ data: [{ phone_e164: "+639171234567" }], error: null }];

    await expect(listSuppressedPhones("tenant-1")).resolves.toEqual(["+639171234567"]);
    expect(argsFor("from")).toContainEqual(["sms_suppressions"]);
  });

  it("throws on failure — silently returning none would un-block everyone", async () => {
    queued = [{ data: null, error: { message: "network" } }];

    await expect(listSuppressedPhones("tenant-1")).rejects.toThrow("network");
  });
});

describe("setCustomerOptOut", () => {
  it("stamps a timestamp when opting a guest out, so the choice is auditable", async () => {
    queued = [{ data: null, error: null }];

    await setCustomerOptOut("c1", true);

    const [[patch]] = argsFor("update") as [[Record<string, unknown>]];
    expect(patch.sms_opt_out).toBe(true);
    expect(typeof patch.sms_opt_out_at).toBe("string");
  });

  it("clears the timestamp when the guest is allowed back in", async () => {
    queued = [{ data: null, error: null }];

    await setCustomerOptOut("c1", false);

    const [[patch]] = argsFor("update") as [[Record<string, unknown>]];
    expect(patch.sms_opt_out).toBe(false);
    expect(patch.sms_opt_out_at).toBeNull();
  });

  it("targets exactly one customer", async () => {
    queued = [{ data: null, error: null }];

    await setCustomerOptOut("c1", true);

    expect(argsFor("eq")).toContainEqual(["id", "c1"]);
  });

  it("throws when the write fails, so the screen can roll its optimism back", async () => {
    queued = [{ data: null, error: { message: "offline" } }];

    await expect(setCustomerOptOut("c1", true)).rejects.toThrow("offline");
  });
});
