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
  ["select", "eq", "in", "order"].forEach((method) => {
    builder[method] = jest.fn(() => builder);
  });
  builder.then = result.then.bind(result);
  return builder;
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
