import { listProducts } from "./products";

/**
 * The register must ring up its own branch's prices.
 *
 * A cashier at a branch that charges less than the rest of the chain would
 * otherwise take the store-wide price at the counter while the same dish
 * ordered online, from the same shop, is charged correctly — the one place a
 * merchant is guaranteed to notice, and the one place they cannot correct it
 * after the fact.
 */

const from = jest.fn();

jest.mock("./supabase", () => ({
  supabase: {
    get from() {
      return from;
    },
  },
}));

/** A PostgREST-ish chain resolving to `rows` however it is filtered. */
function chain(rows: unknown[]) {
  const result = Promise.resolve({ data: rows, error: null });
  const builder: Record<string, unknown> = {};
  ["select", "eq", "in", "order", "range"].forEach((method) => {
    builder[method] = jest.fn(() => builder);
  });
  builder.then = result.then.bind(result);
  return builder;
}

/**
 * A table that answers like the platform database: `.range(from, to)` is
 * honoured, and one response never carries more than 1,000 rows, whatever was
 * asked for. A read that does not page stops there and says nothing.
 */
const MAX_ROWS_PER_RESPONSE = 1000;

function cappedTable(rows: unknown[]) {
  return () => {
    let window = { from: 0, to: Number.POSITIVE_INFINITY };
    const builder: Record<string, unknown> = {};
    ["select", "eq", "in", "order"].forEach((method) => {
      builder[method] = jest.fn(() => builder);
    });
    builder.range = jest.fn((from: number, to: number) => {
      window = { from, to };
      return builder;
    });
    builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
      const end = Math.min(window.to + 1, window.from + MAX_ROWS_PER_RESPONSE);
      return Promise.resolve({ data: rows.slice(window.from, end), error: null }).then(resolve, reject);
    };
    return builder;
  };
}

const PRODUCT = {
  id: "adobo",
  tenant_id: "t1",
  category_id: "c1",
  name: "Adobo",
  description: "",
  price: 180,
  discounted_price: null,
  image_url: "",
  is_available: true,
  is_featured: false,
  order: 0,
};

const OVERRIDE = {
  id: "omi-1",
  tenant_id: "t1",
  outlet_id: "branch-a",
  menu_item_id: "adobo",
  is_listed: true,
  is_available: true,
  price: 160,
  discounted_price: null,
  discount_cleared: false,
  created_at: "",
  updated_at: "",
};

describe("listProducts — branch pricing", () => {
  beforeEach(() => {
    from.mockReset();
  });

  it("returns store-wide prices when the register has no branch", async () => {
    from.mockImplementation(() => chain([PRODUCT]));

    const products = await listProducts("t1");

    expect(products[0].price).toBe(180);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("returns the branch's price at a branch register", async () => {
    from.mockImplementation((table: string) =>
      chain(table === "outlet_menu_items" ? [OVERRIDE] : [PRODUCT]),
    );

    const products = await listProducts("t1", "branch-a");

    expect(products[0].price).toBe(160);
  });

  it("starts the branch price read before a slow product read completes", async () => {
    let releaseProducts!: (value: { data: unknown[]; error: null }) => void;
    const pending = new Promise<{ data: unknown[]; error: null }>((resolve) => {
      releaseProducts = resolve;
    });
    const productsQuery = chain([]);
    productsQuery.then = pending.then.bind(pending);
    let overridesStarted = false;
    const overridesQuery = chain([OVERRIDE]);
    const resolveOverrides = overridesQuery.then as Promise<unknown>["then"];
    overridesQuery.then = (...args: Parameters<Promise<unknown>["then"]>) => {
      overridesStarted = true;
      return resolveOverrides(...args);
    };
    from.mockImplementation((table: string) =>
      table === "outlet_menu_items" ? overridesQuery : productsQuery,
    );

    const loading = listProducts("t1", "branch-a");
    await Promise.resolve();
    await Promise.resolve();
    const startedWhileProductsPending = overridesStarted;
    releaseProducts({ data: [PRODUCT], error: null });
    const products = await loading;

    expect(startedWhileProductsPending).toBe(true);
    expect(products[0].price).toBe(160);
  });

  it("drops a dish this branch does not carry", async () => {
    from.mockImplementation((table: string) =>
      chain(
        table === "outlet_menu_items"
          ? [{ ...OVERRIDE, is_listed: false }]
          : [PRODUCT],
      ),
    );

    const products = await listProducts("t1", "branch-a");

    expect(products).toHaveLength(0);
  });

  it("refuses a failed branch price read instead of offering store-wide prices", async () => {
    const overridesQuery = chain([]);
    const failure = Promise.resolve({ data: null, error: new Error("Branch prices unavailable") });
    overridesQuery.then = failure.then.bind(failure);
    from.mockImplementation((table: string) =>
      table === "outlet_menu_items" ? overridesQuery : chain([PRODUCT]),
    );

    await expect(listProducts("t1", "branch-a")).rejects.toThrow("Branch prices unavailable");
  });

  it("marks a dish this branch has run out of unavailable", async () => {
    from.mockImplementation((table: string) =>
      chain(
        table === "outlet_menu_items"
          ? [{ ...OVERRIDE, is_available: false }]
          : [PRODUCT],
      ),
    );

    const products = await listProducts("t1", "branch-a");

    // Still listed — the register shows it greyed out, the same way the
    // storefront does, rather than making the cashier wonder where it went.
    expect(products).toHaveLength(1);
    expect(products[0].is_available).toBe(false);
  });
});

describe("listProducts — a menu longer than one response", () => {
  const dishId = (index: number) => `dish-${String(index).padStart(5, "0")}`;
  const menu = (count: number) =>
    Array.from({ length: count }, (_, index) => ({ ...PRODUCT, id: dishId(index), order: index }));
  const branchPrices = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      ...OVERRIDE,
      id: `omi-${index}`,
      menu_item_id: dishId(index),
      price: 160,
    }));

  beforeEach(() => {
    from.mockReset();
  });

  it("hands the register every dish, not the first 1,000", async () => {
    from.mockImplementation(cappedTable(menu(1200)));

    const products = await listProducts("t1");

    expect(products).toHaveLength(1200);
    expect(products[1199].id).toBe(dishId(1199));
  });

  it("rings up the branch's price for a dish past the first 1,000 overrides", async () => {
    const tables: Record<string, () => unknown> = {
      menu_items: cappedTable(menu(1200)),
      outlet_menu_items: cappedTable(branchPrices(1200)),
    };
    from.mockImplementation((table: string) => tables[table]());

    const products = await listProducts("t1", "branch-a");

    expect(products).toHaveLength(1200);
    // Every dish, the last one included, at the branch's 160 and not the store's 180.
    expect(products.filter((product) => product.price !== 160)).toEqual([]);
  });

  it("orders the branch prices by something unique, so pages never overlap or skip", async () => {
    const overrides = cappedTable(branchPrices(3))() as Record<string, jest.Mock>;
    from.mockImplementation((table: string) =>
      table === "outlet_menu_items" ? overrides : chain([PRODUCT]),
    );

    await listProducts("t1", "branch-a");

    expect(overrides.order.mock.calls).toEqual([["menu_item_id", { ascending: true }]]);
  });

  it("fails rather than hand the register part of a menu too long to read", async () => {
    from.mockImplementation(cappedTable(menu(10_001)));

    await expect(listProducts("t1")).rejects.toThrow(/more than 10,000 dishes/);
  });
});
