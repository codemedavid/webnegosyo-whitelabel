/**
 * Reading and writing the tenant's vouchers from the merchant app.
 *
 * The app writes the same `vouchers` / `voucher_targets` rows the web admin's
 * server action does, under the tenant-scoped RLS policy, so these tests pin
 * that the row it writes is the web's row: same normalisation, same defaults,
 * scoped to the tenant on every update, and targets replaced wholesale.
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
      "delete",
      "eq",
      "in",
      "order",
      "limit",
      "single",
      "maybeSingle",
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

import type { VoucherDraft } from "../vouchers/admin-validation";
import {
  getManagedVoucher,
  listManagedVouchers,
  listVoucherRedemptions,
  saveVoucher,
  setVoucherActive,
  summarizeRedemptions,
} from "./voucher-repository";

function argsFor(method: string): unknown[][] {
  return calls.filter((c) => c.method === method).map((c) => c.args);
}

const ROW = {
  id: "v1",
  tenant_id: "t1",
  code: "LUNCH50",
  name: "Lunch",
  description: null,
  discount_type: "fixed",
  discount_value: "50.00",
  max_discount_amount: null,
  min_order_amount: "0",
  scope: "products",
  is_stackable: false,
  usage_limit_total: null,
  usage_limit_per_customer: null,
  used_count: 3,
  starts_at: null,
  ends_at: null,
  channels: ["pos"],
  outlet_ids: null,
  is_active: true,
  voucher_targets: [{ voucher_id: "v1", target_type: "menu_item", target_id: "p1" }],
};

const DRAFT: VoucherDraft = {
  code: " lunch 50 ",
  name: " Lunch deal ",
  discountType: "percent",
  discountValue: 20,
  maxDiscountAmount: 100,
  minOrderAmount: null,
  scope: "products",
  targetIds: ["p1", "p2"],
  isStackable: true,
  usageLimitTotal: null,
  usageLimitPerCustomer: 1,
  startsAt: null,
  endsAt: "2026-10-01T15:59:59.999Z",
  channels: ["checkout", "pos"],
};

beforeEach(() => {
  calls.length = 0;
  queued = [];
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  (console.error as jest.Mock).mockRestore();
});

describe("listManagedVouchers", () => {
  it("reads every voucher, switched off or not, with its targets, newest first", async () => {
    queued = [{ data: [ROW], error: null }];
    const vouchers = await listManagedVouchers("t1");

    expect(argsFor("from")[0]).toEqual(["vouchers"]);
    expect(String(argsFor("select")[0][0])).toContain("voucher_targets(");
    expect(argsFor("eq")).toEqual([["tenant_id", "t1"]]);
    expect(argsFor("order")[0]).toEqual(["created_at", { ascending: false }]);
    // Postgres numerics arrive as strings; the shared mapper coerces them.
    expect(vouchers[0]).toMatchObject({ discountValue: 50, targetIds: ["p1"], usedCount: 3 });
  });

  it("throws a failed read so the screen can offer a retry", async () => {
    queued = [{ data: null, error: { message: "boom" } }];
    await expect(listManagedVouchers("t1")).rejects.toEqual({ message: "boom" });
  });
});

describe("getManagedVoucher", () => {
  it("reads one voucher of this tenant, or null", async () => {
    queued = [{ data: null, error: null }];
    expect(await getManagedVoucher("v9", "t1")).toBeNull();
    expect(argsFor("eq")).toEqual([
      ["id", "v9"],
      ["tenant_id", "t1"],
    ]);
  });
});

describe("saveVoucher", () => {
  it("inserts the web's row shape and then the picked targets", async () => {
    queued = [
      { data: { id: "new-id" }, error: null }, // insert
      { data: null, error: null }, // clear targets
      { data: null, error: null }, // insert targets
    ];
    const result = await saveVoucher("t1", DRAFT);

    expect(result).toEqual({ ok: true, voucherId: "new-id" });
    expect(argsFor("insert")[0][0]).toEqual({
      tenant_id: "t1",
      code: "LUNCH50",
      name: "Lunch deal",
      discount_type: "percent",
      discount_value: 20,
      max_discount_amount: 100,
      min_order_amount: 0,
      scope: "products",
      is_stackable: true,
      usage_limit_total: null,
      usage_limit_per_customer: 1,
      starts_at: null,
      ends_at: "2026-10-01T15:59:59.999Z",
      channels: ["checkout", "pos"],
    });
    expect(argsFor("insert")[1][0]).toEqual([
      { voucher_id: "new-id", target_type: "menu_item", target_id: "p1" },
      { voucher_id: "new-id", target_type: "menu_item", target_id: "p2" },
    ]);
  });

  it("updates within the tenant, never by id alone", async () => {
    queued = [{ data: { id: "v1" }, error: null }, { data: null, error: null }];
    await saveVoucher("t1", { ...DRAFT, scope: "universal", targetIds: [] }, "v1");

    expect(argsFor("update")).toHaveLength(1);
    expect(argsFor("eq").slice(0, 2)).toEqual([
      ["id", "v1"],
      ["tenant_id", "t1"],
    ]);
    // A whole-order code clears its old targets and writes none.
    expect(argsFor("delete")).toHaveLength(1);
    expect(argsFor("insert")).toHaveLength(0);
  });

  it("writes nothing when the draft breaks the shared rules", async () => {
    const result = await saveVoucher("t1", { ...DRAFT, code: "" });
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("turns the duplicate-code index into a sentence and a field error", async () => {
    queued = [{ data: null, error: { code: "23505", message: "duplicate key" } }];
    const result = await saveVoucher("t1", DRAFT);
    expect(result).toEqual({
      ok: false,
      error: "The code LUNCH50 is already in use.",
      issues: [{ field: "code", message: "This code already exists." }],
    });
  });

  it("names a refused write as a permission problem", async () => {
    queued = [{ data: null, error: { code: "42501", message: "row-level security" } }];
    const result = await saveVoucher("t1", DRAFT);
    expect(result).toEqual({ ok: false, error: "You don't have permission to manage vouchers." });
  });

  it("reports a failed target write instead of claiming success", async () => {
    queued = [
      { data: { id: "v1" }, error: null },
      { data: null, error: null },
      { data: null, error: { message: "targets failed" } },
    ];
    const result = await saveVoucher("t1", DRAFT, "v1");
    expect(result).toEqual({
      ok: false,
      error: "The voucher was saved, but its products could not be. Open it and save again.",
      voucherId: "v1",
    });
  });
});

describe("setVoucherActive", () => {
  it("flips the switch within the tenant", async () => {
    queued = [{ data: null, error: null }];
    await setVoucherActive("v1", "t1", false);
    expect(argsFor("update")[0][0]).toEqual({ is_active: false });
    expect(argsFor("eq")).toEqual([
      ["id", "v1"],
      ["tenant_id", "t1"],
    ]);
  });

  it("throws on failure so the optimistic switch can roll back", async () => {
    queued = [{ data: null, error: { message: "nope" } }];
    await expect(setVoucherActive("v1", "t1", true)).rejects.toEqual({ message: "nope" });
  });
});

describe("redemptions", () => {
  it("reads one voucher's recent uses within the tenant", async () => {
    queued = [
      {
        data: [
          { amount_discounted: "40.50", channel: "pos", created_at: "2026-09-25T02:00:00Z", order_id: "o2" },
          { amount_discounted: 20, channel: "checkout", created_at: "2026-09-24T02:00:00Z", order_id: "o1" },
        ],
        error: null,
      },
    ];
    const rows = await listVoucherRedemptions("v1", "t1");
    expect(argsFor("from")[0]).toEqual(["voucher_redemptions"]);
    expect(argsFor("eq")).toEqual([
      ["voucher_id", "v1"],
      ["tenant_id", "t1"],
    ]);
    expect(rows[0]).toEqual({
      amount: 40.5,
      channel: "pos",
      createdAt: "2026-09-25T02:00:00Z",
      orderId: "o2",
    });
  });

  it("sums what was given away and finds the last use", () => {
    const summary = summarizeRedemptions(
      [
        { amount: 40.5, channel: "pos", createdAt: "2026-09-25T02:00:00Z", orderId: "o2" },
        { amount: 20, channel: "checkout", createdAt: "2026-09-24T02:00:00Z", orderId: "o1" },
      ],
      500,
    );
    expect(summary).toEqual({
      count: 2,
      totalDiscounted: 60.5,
      averageDiscount: 30.25,
      lastUsedAt: "2026-09-25T02:00:00Z",
      isTruncated: false,
    });
  });

  it("flags a total that only covers the rows it read", () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      amount: 10,
      channel: "pos" as const,
      createdAt: `2026-09-2${i}T00:00:00Z`,
      orderId: `o${i}`,
    }));
    expect(summarizeRedemptions(rows, 3).isTruncated).toBe(true);
    expect(summarizeRedemptions([], 3)).toEqual({
      count: 0,
      totalDiscounted: 0,
      averageDiscount: 0,
      lastUsedAt: null,
      isTruncated: false,
    });
  });
});
