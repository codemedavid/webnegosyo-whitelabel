import {
  validateProductInput,
  sanitizeSearchQuery,
  calculateMargin,
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  toggleProductAvailability,
  listCategories,
  buildEditorFormState,
  EMPTY_PRODUCT_INPUT,
  type ProductInput,
} from "./products";

jest.mock("./supabase", () => {
  const chain: Record<string, jest.Mock> = {};
  const makeChain = () => {
    const c: Record<string, jest.Mock> = {};
    [
      "select",
      "eq",
      "order",
      "insert",
      "update",
      "delete",
      "single",
    ].forEach((method) => {
      c[method] = jest.fn(() => c);
    });
    return c;
  };
  return {
    supabase: {
      from: jest.fn(() => makeChain()),
    },
  };
});

import { supabase } from "./supabase";

beforeEach(() => {
  jest.clearAllMocks();
});

const validInput: ProductInput = {
  name: "Iced Latte",
  description: "A refreshing iced latte with espresso and milk.",
  price: 120,
  discounted_price: null,
  image_url: "",
  category_id: "9f4c3d2e-1234-4a56-8b9c-0d1e2f3a4b5c",
  is_available: true,
  is_featured: false,
};

describe("validateProductInput", () => {
  it("accepts a fully valid product", () => {
    const result = validateProductInput(validInput);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it("rejects a name shorter than 2 characters", () => {
    const result = validateProductInput({ ...validInput, name: "A" });
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBeDefined();
  });

  it("rejects a description shorter than 10 characters", () => {
    const result = validateProductInput({ ...validInput, description: "short" });
    expect(result.valid).toBe(false);
    expect(result.errors.description).toBeDefined();
  });

  it("rejects a zero or negative price", () => {
    expect(validateProductInput({ ...validInput, price: 0 }).valid).toBe(false);
    expect(validateProductInput({ ...validInput, price: -5 }).valid).toBe(false);
  });

  it("rejects a missing category", () => {
    const result = validateProductInput({ ...validInput, category_id: "" });
    expect(result.valid).toBe(false);
    expect(result.errors.category_id).toBeDefined();
  });

  it("rejects a discounted price greater than or equal to the price", () => {
    const result = validateProductInput({
      ...validInput,
      price: 100,
      discounted_price: 100,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.discounted_price).toBeDefined();
  });

  it("accepts a discounted price lower than the price", () => {
    const result = validateProductInput({
      ...validInput,
      price: 100,
      discounted_price: 80,
    });
    expect(result.valid).toBe(true);
  });

  it("accepts a null discounted price", () => {
    const result = validateProductInput({ ...validInput, discounted_price: null });
    expect(result.valid).toBe(true);
  });
});

describe("buildEditorFormState", () => {
  // Regression guard for the add-after-edit bug: the product editor is a
  // persistent tab screen that never unmounts, so switching from editing a
  // product to adding a new one reuses the same component. If the create path
  // does not explicitly reset, the "New Product" form shows the previously
  // edited product's data. buildEditorFormState must return a clean slate when
  // there is no loaded product.
  it("returns a blank form and empty text fields for a fresh add (null)", () => {
    const state = buildEditorFormState(null);
    expect(state.form).toEqual(EMPTY_PRODUCT_INPUT);
    expect(state.priceText).toBe("");
    expect(state.discountedPriceText).toBe("");
    expect(state.modifierGroups).toEqual([]);
  });

  it("does not leak the EMPTY_PRODUCT_INPUT singleton (returns a fresh copy)", () => {
    const state = buildEditorFormState(null);
    expect(state.form).not.toBe(EMPTY_PRODUCT_INPUT);
  });

  it("maps a loaded product into the form and text fields", () => {
    const state = buildEditorFormState({
      name: "Iced Latte",
      description: "A refreshing iced latte with espresso and milk.",
      price: 120,
      discounted_price: 99,
      image_url: "https://img/latte.jpg",
      category_id: "cat-1",
      is_available: true,
      is_featured: true,
    });
    expect(state.form.name).toBe("Iced Latte");
    expect(state.form.category_id).toBe("cat-1");
    expect(state.form.is_featured).toBe(true);
    expect(state.priceText).toBe("120");
    expect(state.discountedPriceText).toBe("99");
  });

  it("leaves the discounted price text empty when there is no discount", () => {
    const state = buildEditorFormState({
      name: "Espresso",
      description: "A single shot of espresso, strong and bold.",
      price: 90,
      discounted_price: null,
      image_url: "",
      category_id: "cat-1",
      is_available: true,
      is_featured: false,
    });
    expect(state.discountedPriceText).toBe("");
  });

  it("normalizes an item's legacy variations/addons into editable modifier groups", () => {
    const state = buildEditorFormState({
      name: "Burger",
      description: "A juicy grilled beef burger with all the fixings.",
      price: 150,
      discounted_price: null,
      image_url: "",
      category_id: "cat-1",
      is_available: true,
      is_featured: false,
      addons: [{ id: "a1", name: "Extra Cheese", price: 20 }],
    });
    expect(state.modifierGroups.length).toBe(1);
    expect(state.modifierGroups[0].options[0].name).toBe("Extra Cheese");
    expect(state.modifierGroups[0].options[0].price_modifier).toBe(20);
  });
});

describe("sanitizeSearchQuery", () => {
  it("strips PostgREST filter-special characters", () => {
    expect(sanitizeSearchQuery("latte%_\\*,.()!=><")).toBe("latte");
  });

  it("trims whitespace", () => {
    expect(sanitizeSearchQuery("  latte  ")).toBe("latte");
  });

  it("truncates to 100 characters", () => {
    const long = "a".repeat(150);
    expect(sanitizeSearchQuery(long).length).toBe(100);
  });

  it("returns an empty string for only special characters", () => {
    expect(sanitizeSearchQuery("%_\\*")).toBe("");
  });
});

describe("calculateMargin", () => {
  it("returns null when cost price is not set", () => {
    expect(calculateMargin(120, null)).toBeNull();
  });

  it("computes profit and margin percent for a normal sale", () => {
    const result = calculateMargin(120, 40);
    expect(result).not.toBeNull();
    expect(result?.profit).toBe(80);
    expect(result?.marginPercent).toBeCloseTo(66.6667, 3);
  });

  it("returns zero margin when price equals cost", () => {
    const result = calculateMargin(100, 100);
    expect(result?.profit).toBe(0);
    expect(result?.marginPercent).toBe(0);
  });

  it("returns a negative margin when cost exceeds price", () => {
    const result = calculateMargin(50, 80);
    expect(result?.profit).toBe(-30);
    expect(result?.marginPercent).toBeCloseTo(-60, 3);
  });

  it("returns null margin percent when price is zero to avoid divide-by-zero", () => {
    const result = calculateMargin(0, 10);
    expect(result?.profit).toBe(-10);
    expect(result?.marginPercent).toBeNull();
  });
});

describe("listProducts", () => {
  it("scopes the query to the given tenant and orders by menu order", async () => {
    const single = { data: [{ id: "1" }], error: null };
    const chain: any = {};
    ["select", "eq", "order"].forEach((m) => {
      chain[m] = jest.fn(() => chain);
    });
    chain.order = jest.fn(() => Promise.resolve(single));
    (supabase.from as jest.Mock).mockReturnValueOnce(chain);

    const result = await listProducts("tenant-1");

    expect(supabase.from).toHaveBeenCalledWith("menu_items");
    expect(chain.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(result).toEqual([{ id: "1" }]);
  });

  it("throws when Supabase returns an error", async () => {
    const chain: any = {};
    ["select", "eq"].forEach((m) => {
      chain[m] = jest.fn(() => chain);
    });
    chain.order = jest.fn(() =>
      Promise.resolve({ data: null, error: new Error("db down") })
    );
    (supabase.from as jest.Mock).mockReturnValueOnce(chain);

    await expect(listProducts("tenant-1")).rejects.toThrow("db down");
  });
});

describe("createProduct", () => {
  it("rejects an invalid product without calling Supabase", async () => {
    await expect(
      createProduct("tenant-1", { ...validInput, name: "" })
    ).rejects.toThrow();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("inserts the product scoped to the tenant", async () => {
    const chain: any = {};
    ["insert", "select"].forEach((m) => {
      chain[m] = jest.fn(() => chain);
    });
    chain.single = jest.fn(() =>
      Promise.resolve({ data: { id: "new-1", ...validInput }, error: null })
    );
    (supabase.from as jest.Mock).mockReturnValueOnce(chain);

    const result = await createProduct("tenant-1", validInput);

    expect(supabase.from).toHaveBeenCalledWith("menu_items");
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: "tenant-1", name: validInput.name })
    );
    expect(result.id).toBe("new-1");
  });
});

describe("createProduct with modifier groups", () => {
  it("persists modifier_groups on insert", async () => {
    const chain: any = {};
    ["insert", "select"].forEach((m) => {
      chain[m] = jest.fn(() => chain);
    });
    chain.single = jest.fn(() => Promise.resolve({ data: { id: "new-1" }, error: null }));
    (supabase.from as jest.Mock).mockReturnValueOnce(chain);

    await createProduct("tenant-1", {
      ...validInput,
      modifier_groups: [
        {
          id: "g1",
          name: "Size",
          display_order: 0,
          min_select: 1,
          max_select: 1,
          options: [{ id: "o1", name: "Large", price_modifier: 20, display_order: 0 }],
        },
      ],
    });

    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        modifier_groups: expect.arrayContaining([
          expect.objectContaining({ name: "Size" }),
        ]),
      })
    );
  });
});

/**
 * The storefront, customer app and desktop POS still read the legacy
 * `variation_types` / `addons` columns. Writing only `modifier_groups` makes
 * add-ons authored in this app invisible everywhere else, so every write must
 * mirror the unified groups into the legacy columns.
 */
describe("legacy column mirroring on save", () => {
  const addonGroup = {
    id: "g-addons",
    name: "Add-ons",
    display_order: 1,
    min_select: 0,
    max_select: null,
    options: [
      { id: "o-cheese", name: "Extra Cheese", price_modifier: 20, display_order: 0 },
    ],
  };
  const sizeGroup = {
    id: "g-size",
    name: "Size",
    display_order: 0,
    min_select: 1,
    max_select: 1,
    options: [{ id: "o-l", name: "Large", price_modifier: 20, display_order: 0 }],
  };

  function mockInsertChain() {
    const chain: any = {};
    ["insert", "select"].forEach((m) => {
      chain[m] = jest.fn(() => chain);
    });
    chain.single = jest.fn(() => Promise.resolve({ data: { id: "new-1" }, error: null }));
    (supabase.from as jest.Mock).mockReturnValueOnce(chain);
    return chain;
  }

  function mockUpdateChain() {
    const chain: any = {};
    ["update", "eq", "select"].forEach((m) => {
      chain[m] = jest.fn(() => chain);
    });
    chain.single = jest.fn(() => Promise.resolve({ data: { id: "1" }, error: null }));
    (supabase.from as jest.Mock).mockReturnValueOnce(chain);
    return chain;
  }

  it("writes multi-select options to the addons column on insert", async () => {
    const chain = mockInsertChain();

    await createProduct("tenant-1", {
      ...validInput,
      modifier_groups: [sizeGroup, addonGroup] as any,
    });

    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        addons: [
          { id: "o-cheese", name: "Extra Cheese", price: 20, is_default: undefined },
        ],
        variation_types: [expect.objectContaining({ name: "Size" })],
        variations: [],
      })
    );
  });

  it("writes multi-select options to the addons column on update", async () => {
    const chain = mockUpdateChain();

    await updateProduct("1", "tenant-1", {
      ...validInput,
      modifier_groups: [addonGroup] as any,
    });

    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        addons: [
          { id: "o-cheese", name: "Extra Cheese", price: 20, is_default: undefined },
        ],
        variation_types: [],
      })
    );
  });

  it("clears the legacy columns when every group is removed", async () => {
    const chain = mockUpdateChain();

    await updateProduct("1", "tenant-1", { ...validInput, modifier_groups: [] });

    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ addons: [], variation_types: [], variations: [] })
    );
  });

  it("leaves the legacy columns untouched when the caller omits modifier_groups", async () => {
    const chain = mockUpdateChain();

    await updateProduct("1", "tenant-1", validInput);

    const payload = chain.update.mock.calls[0][0];
    expect(payload).not.toHaveProperty("addons");
    expect(payload).not.toHaveProperty("variation_types");
    expect(payload).not.toHaveProperty("modifier_groups");
  });
});

describe("updateProduct", () => {
  it("updates only the given product for the given tenant", async () => {
    const chain: any = {};
    ["update", "eq", "select"].forEach((m) => {
      chain[m] = jest.fn(() => chain);
    });
    chain.single = jest.fn(() =>
      Promise.resolve({ data: { id: "1", ...validInput }, error: null })
    );
    (supabase.from as jest.Mock).mockReturnValueOnce(chain);

    await updateProduct("1", "tenant-1", validInput);

    expect(chain.eq).toHaveBeenCalledWith("id", "1");
    expect(chain.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
  });
});

describe("deleteProduct", () => {
  it("deletes only the given product for the given tenant", async () => {
    const chain: any = {};
    chain.delete = jest.fn(() => chain);
    chain.eq = jest.fn(() => chain);
    // Last eq call resolves the promise
    let eqCalls = 0;
    chain.eq = jest.fn(() => {
      eqCalls += 1;
      if (eqCalls === 2) return Promise.resolve({ error: null });
      return chain;
    });
    (supabase.from as jest.Mock).mockReturnValueOnce(chain);

    await deleteProduct("1", "tenant-1");

    expect(chain.delete).toHaveBeenCalled();
  });
});

describe("toggleProductAvailability", () => {
  it("updates only is_available for the given product", async () => {
    const chain: any = {};
    ["update", "eq", "select"].forEach((m) => {
      chain[m] = jest.fn(() => chain);
    });
    chain.single = jest.fn(() =>
      Promise.resolve({ data: { id: "1", is_available: false }, error: null })
    );
    (supabase.from as jest.Mock).mockReturnValueOnce(chain);

    await toggleProductAvailability("1", "tenant-1", false);

    expect(chain.update).toHaveBeenCalledWith({ is_available: false });
  });
});

describe("listCategories", () => {
  it("scopes categories to the tenant and orders them", async () => {
    const chain: any = {};
    ["select", "eq"].forEach((m) => {
      chain[m] = jest.fn(() => chain);
    });
    chain.order = jest.fn(() =>
      Promise.resolve({ data: [{ id: "cat-1", name: "Coffee" }], error: null })
    );
    (supabase.from as jest.Mock).mockReturnValueOnce(chain);

    const result = await listCategories("tenant-1");

    expect(supabase.from).toHaveBeenCalledWith("categories");
    expect(chain.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(result).toEqual([{ id: "cat-1", name: "Coffee" }]);
  });
});
