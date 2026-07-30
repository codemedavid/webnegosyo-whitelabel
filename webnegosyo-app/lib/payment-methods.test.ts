/**
 * Managing the tenant's payment methods from the merchant app.
 *
 * The register's read (lib/pos-catalog.ts) and this management read are
 * deliberately opposite queries, and these tests pin that difference: the
 * register asks "what may I take payment with right now?" and so filters to
 * active methods inner-joined to one order type, while management asks "what
 * have I set up?" and must surface the deactivated method and the method
 * linked to nothing — the two rows a merchant most needs to find and fix.
 */

const calls: { method: string; args: unknown[] }[] = [];
let queued: { data: unknown; error: unknown }[] = [];

function nextResult(): { data: unknown; error: unknown } {
  return queued.shift() ?? { data: [], error: null };
}

jest.mock("./supabase", () => {
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
    // Awaiting anywhere in the builder resolves the query, so a call that ends
    // at `.eq(...)` (a delete) and one that ends at `.single()` both work.
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
  EMPTY_PAYMENT_METHOD_INPUT,
  buildEditorFormState,
  createPaymentMethod,
  deletePaymentMethod,
  getPaymentMethod,
  isOfferedNowhere,
  listManagedPaymentMethods,
  moveMethod,
  reorderPaymentMethods,
  setOrderTypes,
  togglePaymentMethodStatus,
  updatePaymentMethod,
  validatePaymentMethodInput,
  type ManagedPaymentMethod,
  type PaymentMethodInput,
} from "./payment-methods";

function argsFor(method: string): unknown[][] {
  return calls.filter((c) => c.method === method).map((c) => c.args);
}

function tablesTouched(): string[] {
  return argsFor("from").map((a) => String(a[0]));
}

const VALID_INPUT: PaymentMethodInput = {
  name: "GCash",
  details: "0917 123 4567",
  qr_code_url: "https://ik.imagekit.io/x/qr.png",
  is_active: true,
  require_payment_proof: true,
  order_type_ids: ["ot-1"],
};

function method(overrides: Partial<ManagedPaymentMethod> = {}): ManagedPaymentMethod {
  return {
    id: "pm-1",
    tenant_id: "t-1",
    name: "Cash",
    details: null,
    qr_code_url: null,
    is_active: true,
    order_index: 0,
    require_payment_proof: false,
    order_type_ids: ["ot-1"],
    ...overrides,
  };
}

beforeEach(() => {
  calls.length = 0;
  queued = [];
});

describe("validatePaymentMethodInput", () => {
  it("accepts a fully specified method", () => {
    expect(validatePaymentMethodInput(VALID_INPUT)).toEqual({
      valid: true,
      errors: {},
    });
  });

  it("rejects a name too short to identify at checkout", () => {
    const result = validatePaymentMethodInput({ ...VALID_INPUT, name: "G" });

    expect(result.valid).toBe(false);
    expect(result.errors.name).toBeDefined();
  });

  it("rejects a method linked to no order type", () => {
    // A method with no link is offered on no channel — it would save cleanly
    // and then be invisible everywhere, which reads to the merchant as the
    // save having failed.
    const result = validatePaymentMethodInput({
      ...VALID_INPUT,
      order_type_ids: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.order_type_ids).toBeDefined();
  });

  it("treats a blank QR url as simply not having one", () => {
    expect(
      validatePaymentMethodInput({ ...VALID_INPUT, qr_code_url: "" }).valid,
    ).toBe(true);
  });

  it("rejects a QR url that is not a url", () => {
    const result = validatePaymentMethodInput({
      ...VALID_INPUT,
      qr_code_url: "not a url",
    });

    expect(result.valid).toBe(false);
    expect(result.errors.qr_code_url).toBeDefined();
  });
});

describe("buildEditorFormState", () => {
  it("returns pristine values when adding rather than editing", () => {
    // The editor is reached repeatedly from a persistent tab tree, so the add
    // path has to be a clean slate rather than whatever was last edited.
    expect(buildEditorFormState(null).form).toEqual(EMPTY_PAYMENT_METHOD_INPUT);
  });

  it("hands back a copy, so editing the form cannot corrupt the blank template", () => {
    const state = buildEditorFormState(null);
    state.form.name = "typed";

    expect(EMPTY_PAYMENT_METHOD_INPUT.name).toBe("");
  });

  it("renders a loaded method's empty columns as empty text inputs", () => {
    const state = buildEditorFormState(
      method({ name: "Cash", details: null, qr_code_url: null }),
    );

    expect(state.form.details).toBe("");
    expect(state.form.qr_code_url).toBe("");
  });

  it("carries the loaded order-type links into the form", () => {
    const state = buildEditorFormState(
      method({ order_type_ids: ["ot-1", "ot-2"] }),
    );

    expect(state.form.order_type_ids).toEqual(["ot-1", "ot-2"]);
  });
});

describe("isOfferedNowhere", () => {
  it("flags a method linked to no order type", () => {
    expect(isOfferedNowhere(method({ order_type_ids: [] }))).toBe(true);
  });

  it("leaves a linked method alone", () => {
    expect(isOfferedNowhere(method({ order_type_ids: ["ot-1"] }))).toBe(false);
  });
});

describe("moveMethod", () => {
  const list = [
    method({ id: "a", order_index: 0 }),
    method({ id: "b", order_index: 1 }),
    method({ id: "c", order_index: 2 }),
  ];

  it("swaps a method with the one above it", () => {
    expect(moveMethod(list, "b", "up").map((m) => m.id)).toEqual(["b", "a", "c"]);
  });

  it("swaps a method with the one below it", () => {
    expect(moveMethod(list, "b", "down").map((m) => m.id)).toEqual(["a", "c", "b"]);
  });

  it("renumbers order_index to the new positions", () => {
    // The index is what the storefront sorts by, so a swap that moves the rows
    // without renumbering them would look right here and change nothing there.
    expect(moveMethod(list, "b", "up").map((m) => m.order_index)).toEqual([0, 1, 2]);
    expect(moveMethod(list, "b", "up")[0]).toMatchObject({ id: "b", order_index: 0 });
  });

  it("leaves the order untouched at the ends", () => {
    expect(moveMethod(list, "a", "up").map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(moveMethod(list, "c", "down").map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("ignores an id that is not in the list", () => {
    expect(moveMethod(list, "missing", "up").map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the list it was given", () => {
    moveMethod(list, "b", "up");

    expect(list.map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(list[1].order_index).toBe(1);
  });
});

describe("listManagedPaymentMethods", () => {
  it("reads the tenant's methods whatever their status", async () => {
    // Management is the only place a deactivated method can be switched back
    // on; filtering by is_active here would strand it.
    await listManagedPaymentMethods("t-1");

    expect(tablesTouched()[0]).toBe("payment_methods");
    expect(argsFor("eq")).toEqual([["tenant_id", "t-1"]]);
  });

  it("left-joins the order-type links so a method offered nowhere still appears", async () => {
    await listManagedPaymentMethods("t-1");

    const select = String(argsFor("select")[0][0]);
    expect(select).toContain("payment_method_order_types(order_type_id)");
    expect(select).not.toContain("!inner");
  });

  it("returns the methods in the merchant's configured order", async () => {
    await listManagedPaymentMethods("t-1");

    expect(argsFor("order")[0]).toEqual(["order_index", { ascending: true }]);
  });

  it("flattens the junction rows into a list of order-type ids", async () => {
    queued = [
      {
        data: [
          {
            id: "pm-1",
            tenant_id: "t-1",
            name: "GCash",
            details: null,
            qr_code_url: null,
            is_active: true,
            order_index: 0,
            require_payment_proof: false,
            payment_method_order_types: [
              { order_type_id: "ot-1" },
              { order_type_id: "ot-2" },
            ],
          },
        ],
        error: null,
      },
    ];

    const [loaded] = await listManagedPaymentMethods("t-1");

    expect(loaded.order_type_ids).toEqual(["ot-1", "ot-2"]);
    expect(loaded).not.toHaveProperty("payment_method_order_types");
  });

  it("reads a method with no links as offered nowhere rather than crashing", async () => {
    queued = [
      {
        data: [
          {
            id: "pm-1",
            tenant_id: "t-1",
            name: "GCash",
            details: null,
            qr_code_url: null,
            is_active: false,
            order_index: 0,
            require_payment_proof: false,
            payment_method_order_types: null,
          },
        ],
        error: null,
      },
    ];

    expect((await listManagedPaymentMethods("t-1"))[0].order_type_ids).toEqual([]);
  });

  it("surfaces a query error instead of showing an empty list", async () => {
    // An empty list and a failed read look identical to the merchant, and one
    // of them is a lie about their own checkout.
    queued = [{ data: null, error: new Error("permission denied") }];

    await expect(listManagedPaymentMethods("t-1")).rejects.toThrow(
      "permission denied",
    );
  });
});

describe("getPaymentMethod", () => {
  it("reads one method scoped to the tenant", async () => {
    queued = [{ data: null, error: null }];

    await getPaymentMethod("pm-1", "t-1");

    expect(argsFor("eq")).toEqual([
      ["id", "pm-1"],
      ["tenant_id", "t-1"],
    ]);
  });

  it("returns null when the method is not this tenant's", async () => {
    // maybeSingle, not single: opening a stale link should show "not found",
    // not an error the merchant reads as the app being broken.
    queued = [{ data: null, error: null }];

    expect(await getPaymentMethod("pm-1", "t-1")).toBeNull();
  });

  it("flattens the links so the editor can tick the right order types", async () => {
    queued = [
      {
        data: {
          id: "pm-1",
          tenant_id: "t-1",
          name: "GCash",
          details: null,
          qr_code_url: null,
          is_active: true,
          order_index: 0,
          require_payment_proof: true,
          payment_method_order_types: [{ order_type_id: "ot-2" }],
        },
        error: null,
      },
    ];

    expect(await getPaymentMethod("pm-1", "t-1")).toMatchObject({
      name: "GCash",
      require_payment_proof: true,
      order_type_ids: ["ot-2"],
    });
  });

  it("surfaces a query error instead of reporting the method missing", async () => {
    queued = [{ data: null, error: new Error("permission denied") }];

    await expect(getPaymentMethod("pm-1", "t-1")).rejects.toThrow(
      "permission denied",
    );
  });
});

describe("createPaymentMethod", () => {
  it("refuses invalid input before writing anything", async () => {
    await expect(
      createPaymentMethod("t-1", { ...VALID_INPUT, order_type_ids: [] }),
    ).rejects.toThrow();

    expect(calls).toHaveLength(0);
  });

  it("places a new method after the merchant's existing ones", async () => {
    queued = [
      { data: { order_index: 4 }, error: null },
      { data: { id: "pm-new" }, error: null },
      { data: null, error: null },
    ];

    await createPaymentMethod("t-1", VALID_INPUT);

    const inserted = argsFor("insert")[0][0] as Record<string, unknown>;
    expect(inserted.order_index).toBe(5);
    expect(inserted.tenant_id).toBe("t-1");
  });

  it("starts the first method at zero when the tenant has none", async () => {
    queued = [
      { data: null, error: null },
      { data: { id: "pm-new" }, error: null },
      { data: null, error: null },
    ];

    await createPaymentMethod("t-1", VALID_INPUT);

    expect((argsFor("insert")[0][0] as Record<string, unknown>).order_index).toBe(0);
  });

  it("never writes the order-type links into the payment_methods row", async () => {
    // `order_type_ids` is a shape this module invents for the editor; the
    // column does not exist, and Postgres rejects the whole insert if sent.
    queued = [
      { data: null, error: null },
      { data: { id: "pm-new" }, error: null },
      { data: null, error: null },
    ];

    await createPaymentMethod("t-1", VALID_INPUT);

    expect(argsFor("insert")[0][0]).not.toHaveProperty("order_type_ids");
  });

  it("links the chosen order types to the new method", async () => {
    queued = [
      { data: null, error: null },
      { data: { id: "pm-new" }, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ];

    await createPaymentMethod("t-1", {
      ...VALID_INPUT,
      order_type_ids: ["ot-1", "ot-2"],
    });

    expect(tablesTouched()).toContain("payment_method_order_types");
    const links = argsFor("insert")[1][0] as { order_type_id: string }[];
    expect(links.map((l) => l.order_type_id)).toEqual(["ot-1", "ot-2"]);
  });
});

describe("updatePaymentMethod", () => {
  it("scopes the write to the tenant as well as the row", async () => {
    // id alone would let a stale or guessed id edit another store's method.
    queued = [
      { data: { id: "pm-1" }, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ];

    await updatePaymentMethod("pm-1", "t-1", VALID_INPUT);

    expect(argsFor("eq").slice(0, 2)).toEqual([
      ["id", "pm-1"],
      ["tenant_id", "t-1"],
    ]);
  });

  it("never writes the order-type links into the payment_methods row", async () => {
    queued = [
      { data: { id: "pm-1" }, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ];

    await updatePaymentMethod("pm-1", "t-1", VALID_INPUT);

    expect(argsFor("update")[0][0]).not.toHaveProperty("order_type_ids");
  });

  it("replaces the order-type links in the same save", async () => {
    queued = [
      { data: { id: "pm-1" }, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ];

    await updatePaymentMethod("pm-1", "t-1", VALID_INPUT);

    expect(tablesTouched()).toContain("payment_method_order_types");
    expect(argsFor("delete")).toHaveLength(1);
  });

  it("refuses invalid input before writing anything", async () => {
    await expect(
      updatePaymentMethod("pm-1", "t-1", { ...VALID_INPUT, name: "" }),
    ).rejects.toThrow();

    expect(calls).toHaveLength(0);
  });
});

describe("setOrderTypes", () => {
  it("clears the old links before writing the new ones", async () => {
    // Insert-only would accumulate links and re-offer a method on a channel
    // the merchant just unticked.
    await setOrderTypes("pm-1", ["ot-2"]);

    const sequence = calls
      .filter((c) => ["delete", "insert"].includes(c.method))
      .map((c) => c.method);
    expect(sequence).toEqual(["delete", "insert"]);
    expect(argsFor("eq")[0]).toEqual(["payment_method_id", "pm-1"]);
  });

  it("clears the links without inserting when none are chosen", async () => {
    await setOrderTypes("pm-1", []);

    expect(argsFor("delete")).toHaveLength(1);
    expect(argsFor("insert")).toHaveLength(0);
  });

  it("surfaces a failed clear instead of writing duplicates on top of it", async () => {
    queued = [{ data: null, error: new Error("delete failed") }];

    await expect(setOrderTypes("pm-1", ["ot-1"])).rejects.toThrow("delete failed");
    expect(argsFor("insert")).toHaveLength(0);
  });
});

describe("togglePaymentMethodStatus", () => {
  it("writes the new status scoped to the tenant", async () => {
    queued = [{ data: { id: "pm-1" }, error: null }];

    await togglePaymentMethodStatus("pm-1", "t-1", false);

    expect(argsFor("update")[0][0]).toEqual({ is_active: false });
    expect(argsFor("eq")).toEqual([
      ["id", "pm-1"],
      ["tenant_id", "t-1"],
    ]);
  });
});

describe("deletePaymentMethod", () => {
  it("deletes only within the tenant", async () => {
    await deletePaymentMethod("pm-1", "t-1");

    expect(tablesTouched()).toEqual(["payment_methods"]);
    expect(argsFor("eq")).toEqual([
      ["id", "pm-1"],
      ["tenant_id", "t-1"],
    ]);
  });

  it("surfaces a delete error rather than reporting success", async () => {
    queued = [{ data: null, error: new Error("foreign key violation") }];

    await expect(deletePaymentMethod("pm-1", "t-1")).rejects.toThrow(
      "foreign key violation",
    );
  });
});

describe("reorderPaymentMethods", () => {
  it("writes each method's position, scoped to the tenant", async () => {
    await reorderPaymentMethods("t-1", [
      method({ id: "b", order_index: 0 }),
      method({ id: "a", order_index: 1 }),
    ]);

    expect(argsFor("update")).toEqual([[{ order_index: 0 }], [{ order_index: 1 }]]);
    expect(argsFor("eq")).toEqual([
      ["id", "b"],
      ["tenant_id", "t-1"],
      ["id", "a"],
      ["tenant_id", "t-1"],
    ]);
  });

  it("surfaces a failed write so the list can be reloaded from the truth", async () => {
    queued = [{ data: null, error: new Error("boom") }];

    await expect(
      reorderPaymentMethods("t-1", [method({ id: "b", order_index: 0 })]),
    ).rejects.toThrow("boom");
  });
});
