/**
 * These cover the two Supabase reads the register depends on. The payment
 * method query in particular MUST stay an inner join on
 * payment_method_order_types — the storefront filters that way, and a
 * divergence would let the register accept payments the customer-facing
 * checkout refuses.
 */

const chainCalls: { method: string; args: unknown[] }[] = [];
let queryResult: { data: unknown; error: unknown } = { data: [], error: null };

jest.mock("./supabase", () => {
  const makeChain = () => {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order"]) {
      chain[method] = (...args: unknown[]) => {
        chainCalls.push({ method, args });
        return chain;
      };
    }
    // `order` terminates the builder — awaiting it resolves the query.
    chain.then = (resolve: (value: unknown) => unknown) => resolve(queryResult);
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => {
        chainCalls.push({ method: "from", args: [table] });
        return makeChain();
      },
    },
  };
});

import { listOrderTypes, listPaymentMethods } from "./pos-catalog";

function argsFor(method: string): unknown[][] {
  return chainCalls.filter((c) => c.method === method).map((c) => c.args);
}

beforeEach(() => {
  chainCalls.length = 0;
  queryResult = { data: [], error: null };
});

describe("listOrderTypes", () => {
  it("reads only the tenant's enabled order types", async () => {
    await listOrderTypes("t-1");

    expect(argsFor("from")[0]).toEqual(["order_types"]);
    expect(argsFor("eq")).toEqual([
      ["tenant_id", "t-1"],
      ["is_enabled", true],
    ]);
  });

  it("maps an enabled percentage service charge onto the order type", async () => {
    queryResult = {
      data: [
        {
          id: "ot-1",
          type: "dine_in",
          name: "Dine In",
          service_charge_enabled: true,
          service_charge_type: "percentage",
          service_charge_value: "10.00",
        },
      ],
      error: null,
    };

    const [orderType] = await listOrderTypes("t-1");
    expect(orderType).toEqual({
      id: "ot-1",
      type: "dine_in",
      name: "Dine In",
      serviceCharge: { type: "percentage", value: 10 },
    });
  });

  it("leaves the service charge off when the merchant disabled it", async () => {
    queryResult = {
      data: [
        {
          id: "ot-2",
          type: "takeout",
          name: "Takeout",
          service_charge_enabled: false,
          service_charge_type: "percentage",
          service_charge_value: "10.00",
        },
      ],
      error: null,
    };

    expect((await listOrderTypes("t-1"))[0].serviceCharge).toBeUndefined();
  });

  it("defaults a charge with a missing type to percentage rather than crashing", async () => {
    queryResult = {
      data: [
        {
          id: "ot-3",
          type: "dine_in",
          name: "Dine In",
          service_charge_enabled: true,
          service_charge_type: null,
          service_charge_value: null,
        },
      ],
      error: null,
    };

    expect((await listOrderTypes("t-1"))[0].serviceCharge).toEqual({
      type: "percentage",
      value: 0,
    });
  });

  it("returns an empty list when the tenant has none", async () => {
    queryResult = { data: null, error: null };
    expect(await listOrderTypes("t-1")).toEqual([]);
  });

  it("surfaces a query error instead of silently returning nothing", async () => {
    queryResult = { data: null, error: new Error("permission denied") };
    await expect(listOrderTypes("t-1")).rejects.toThrow("permission denied");
  });
});

describe("listPaymentMethods", () => {
  it("filters to active methods linked to the chosen order type", async () => {
    await listPaymentMethods("t-1", "ot-1");

    expect(argsFor("from")[0]).toEqual(["payment_methods"]);
    expect(argsFor("eq")).toEqual([
      ["tenant_id", "t-1"],
      ["is_active", true],
      ["payment_method_order_types.order_type_id", "ot-1"],
    ]);
  });

  it("inner-joins the order-type link so unlinked methods are never offered", async () => {
    await listPaymentMethods("t-1", "ot-1");

    const select = String(argsFor("select")[0][0]);
    expect(select).toContain("payment_method_order_types!inner(order_type_id)");
  });

  it("returns methods in the merchant's configured order", async () => {
    await listPaymentMethods("t-1", "ot-1");
    expect(argsFor("order")[0]).toEqual(["order_index", { ascending: true }]);
  });

  it("surfaces a query error instead of silently returning nothing", async () => {
    queryResult = { data: null, error: new Error("boom") };
    await expect(listPaymentMethods("t-1", "ot-1")).rejects.toThrow("boom");
  });

  it("returns an empty list when no method is enabled for the order type", async () => {
    queryResult = { data: null, error: null };
    expect(await listPaymentMethods("t-1", "ot-1")).toEqual([]);
  });
});
