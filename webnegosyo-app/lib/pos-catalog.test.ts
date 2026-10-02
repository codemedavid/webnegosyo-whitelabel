/**
 * These cover the Supabase reads the register depends on. The payment-method
 * read carries each method's order-type links so the storefront's inner-join
 * rule can be applied on the device (`methodsForTender`, tested with it).
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

import {
  listOrderTypeItemPrices,
  listOrderTypes,
  listRegisterOrderTypes,
  listRegisterPaymentMethods,
} from "./pos-catalog";

function argsFor(method: string): unknown[][] {
  return chainCalls.filter((c) => c.method === method).map((c) => c.args);
}

beforeEach(() => {
  chainCalls.length = 0;
  queryResult = { data: [], error: null };
});

describe("listOrderTypes", () => {
  it("reads every enabled order type — the payment-method editor links web-only types too", async () => {
    await listOrderTypes("t-1");

    expect(argsFor("from")[0]).toEqual(["order_types"]);
    expect(argsFor("eq")).toEqual([
      ["tenant_id", "t-1"],
      ["is_enabled", true],
    ]);
  });

  it("selects the POS markup so the register can price the channel", async () => {
    await listOrderTypes("t-1");
    expect(String(argsFor("select")[0][0])).toContain("pos_markup_percent");
  });

  it("maps the numeric markup column onto the order type as a number", async () => {
    queryResult = {
      data: [
        {
          id: "ot-grab",
          type: "grab",
          name: "Grab",
          service_charge_enabled: false,
          service_charge_type: null,
          service_charge_value: null,
          pos_markup_percent: "15.00",
        },
      ],
      error: null,
    };

    expect((await listOrderTypes("t-1"))[0].markupPercent).toBe(15);
  });

  it("reads a missing markup as null, never as zero-by-accident", async () => {
    queryResult = {
      data: [
        {
          id: "ot-1",
          type: "dine_in",
          name: "Dine In",
          service_charge_enabled: false,
          service_charge_type: null,
          service_charge_value: null,
          pos_markup_percent: null,
        },
      ],
      error: null,
    };

    expect((await listOrderTypes("t-1"))[0].markupPercent).toBeNull();
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
          pos_markup_percent: null,
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
      markupPercent: null,
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

describe("listRegisterPaymentMethods", () => {
  it("reads every active method once, with its order-type links, for the offline copy", async () => {
    await listRegisterPaymentMethods("t-1");

    expect(argsFor("from")[0]).toEqual(["payment_methods"]);
    expect(argsFor("eq")).toEqual([
      ["tenant_id", "t-1"],
      ["is_active", true],
    ]);
    const select = String(argsFor("select")[0][0]);
    expect(select).toContain("payment_method_order_types(order_type_id)");
    expect(select).not.toContain("!inner");
    expect(argsFor("order")[0]).toEqual(["order_index", { ascending: true }]);
  });

  it("flattens the links into orderTypeIds", async () => {
    queryResult = {
      data: [
        {
          id: "cash",
          name: "Cash",
          details: null,
          qr_code_url: null,
          require_payment_proof: false,
          order_index: 0,
          payment_method_order_types: [{ order_type_id: "ot-1" }, { order_type_id: "ot-2" }],
        },
        {
          id: "bank",
          name: "Bank",
          details: null,
          qr_code_url: null,
          require_payment_proof: true,
          order_index: 1,
          payment_method_order_types: null,
        },
      ],
      error: null,
    };

    expect(await listRegisterPaymentMethods("t-1")).toEqual([
      {
        id: "cash",
        name: "Cash",
        details: null,
        qr_code_url: null,
        require_payment_proof: false,
        order_index: 0,
        orderTypeIds: ["ot-1", "ot-2"],
      },
      {
        id: "bank",
        name: "Bank",
        details: null,
        qr_code_url: null,
        require_payment_proof: true,
        order_index: 1,
        orderTypeIds: [],
      },
    ]);
  });

  it("surfaces a query error instead of silently returning nothing", async () => {
    queryResult = { data: null, error: new Error("boom") };
    await expect(listRegisterPaymentMethods("t-1")).rejects.toThrow("boom");
  });
});
