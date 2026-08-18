/**
 * Wiring a dish to its ingredients from the merchant's phone.
 *
 * The service under test writes straight to Supabase, the way
 * count-session-service does: a recipe is plain CRUD with no server-side
 * ledger math behind it, and `recipes`/`recipe_components` RLS (migration
 * 20260722120000, "Admins manage own-tenant rows") already confines the writer
 * to their tenant. Every test still asserts the explicit tenant filter — a
 * query that relies on RLS to be correct reads as though it did not need to
 * be.
 */

// The default client is never used — every test injects its own db — but the
// module still imports it, and the real one reaches expo-constants.
jest.mock("./supabase", () => ({ supabase: { from: jest.fn() } }));

import {
  addRecipeComponent,
  ensureMenuItemRecipe,
  loadMenuItemRecipe,
  loadIngredientOptions,
  loadUnitOptions,
  removeRecipeComponent,
  updateRecipeComponent,
} from "./recipe-service";

/** Every operation the service performed, so scoping can be asserted directly. */
interface Recorded {
  filters: { table: string; column: string; value: unknown }[];
  inserts: { table: string; row: Record<string, unknown> }[];
  updates: { table: string; row: Record<string, unknown> }[];
  deletes: { table: string }[];
}

/**
 * A chainable Supabase stub, in the shape count-session-service.test.ts uses.
 *
 * `results` is keyed by table. A plain value answers every call; an ARRAY is a
 * queue, one entry per call in order — which is what lets a test say "no
 * recipe yet, then this is the one that was inserted".
 */
function makeDb(results: Record<string, unknown>) {
  const recorded: Recorded = { filters: [], inserts: [], updates: [], deletes: [] };
  const queues: Record<string, unknown[]> = {};
  for (const [table, value] of Object.entries(results)) {
    if (Array.isArray(value)) queues[table] = [...value];
  }

  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    const settle = () => {
      const queue = queues[table];
      if (queue) return Promise.resolve(queue.shift() ?? { data: null, error: null });
      return Promise.resolve(results[table] ?? { data: null, error: null });
    };

    chain.select = () => chain;
    chain.order = () => chain;
    chain.eq = (column: string, value: unknown) => {
      recorded.filters.push({ table, column, value });
      return chain;
    };
    chain.insert = (row: Record<string, unknown>) => {
      recorded.inserts.push({ table, row });
      return chain;
    };
    chain.update = (row: Record<string, unknown>) => {
      recorded.updates.push({ table, row });
      return chain;
    };
    chain.delete = () => {
      recorded.deletes.push({ table });
      return chain;
    };
    chain.single = settle;
    chain.maybeSingle = settle;
    chain.then = (resolve: (value: unknown) => unknown) => settle().then(resolve);

    return chain;
  };

  return { db: { from } as never, recorded };
}

const TENANT = "tenant-1";
const MENU_ITEM = "dish-1";

describe("loadMenuItemRecipe", () => {
  it("returns null when the dish has no recipe", async () => {
    // Arrange
    const { db, recorded } = makeDb({ recipes: { data: null, error: null } });

    // Act
    const recipe = await loadMenuItemRecipe(TENANT, MENU_ITEM, db);

    // Assert — no recipe, and the lookup was scoped to tenant, item and base type
    expect(recipe).toBeNull();
    expect(recorded.filters).toEqual(
      expect.arrayContaining([
        { table: "recipes", column: "tenant_id", value: TENANT },
        { table: "recipes", column: "menu_item_id", value: MENU_ITEM },
        { table: "recipes", column: "target_type", value: "menu_item" },
      ]),
    );
  });

  it("returns components joined with ingredient names and unit abbreviations", async () => {
    // Arrange
    const { db } = makeDb({
      recipes: { data: { id: "recipe-1" }, error: null },
      recipe_components: {
        data: [
          {
            id: "comp-1",
            inventory_item_id: "ing-flour",
            quantity: "0.2500",
            unit_id: "unit-kg",
            sort_order: 0,
          },
        ],
        error: null,
      },
      inventory_items: { data: [{ id: "ing-flour", name: "Flour" }], error: null },
      inventory_units: { data: [{ id: "unit-kg", abbreviation: "kg" }], error: null },
    });

    // Act
    const recipe = await loadMenuItemRecipe(TENANT, MENU_ITEM, db);

    // Assert
    expect(recipe).toEqual({
      id: "recipe-1",
      components: [
        {
          id: "comp-1",
          inventoryItemId: "ing-flour",
          ingredientName: "Flour",
          quantity: 0.25,
          unitId: "unit-kg",
          unitLabel: "kg",
        },
      ],
    });
  });

  it("costs the labels, not the list, when the unit catalog cannot be read", async () => {
    // Arrange — same failure posture as loadInventoryStock
    const { db } = makeDb({
      recipes: { data: { id: "recipe-1" }, error: null },
      recipe_components: {
        data: [
          { id: "comp-1", inventory_item_id: "ing-x", quantity: 1, unit_id: "u1", sort_order: 0 },
        ],
        error: null,
      },
      inventory_items: { data: null, error: { message: "boom" } },
      inventory_units: { data: null, error: { message: "boom" } },
    });

    // Act
    const recipe = await loadMenuItemRecipe(TENANT, MENU_ITEM, db);

    // Assert — the line survives with blank labels rather than vanishing
    expect(recipe?.components).toHaveLength(1);
    expect(recipe?.components[0].unitLabel).toBe("");
    expect(recipe?.components[0].ingredientName).toBe("");
  });

  it("throws a message worth showing when the components cannot be read", async () => {
    // Arrange
    const { db } = makeDb({
      recipes: { data: { id: "recipe-1" }, error: null },
      recipe_components: { data: null, error: { message: "network down" } },
    });

    // Act + Assert
    await expect(loadMenuItemRecipe(TENANT, MENU_ITEM, db)).rejects.toThrow(/network down/);
  });
});

describe("loadIngredientOptions", () => {
  it("returns active ingredients with their stock unit label as the default", async () => {
    // Arrange
    const { db, recorded } = makeDb({
      inventory_items: {
        data: [
          { id: "ing-1", name: "Flour", is_active: true, stock_unit_id: "unit-kg" },
        ],
        error: null,
      },
      inventory_units: { data: [{ id: "unit-kg", abbreviation: "kg" }], error: null },
    });

    // Act
    const options = await loadIngredientOptions(TENANT, db);

    // Assert
    expect(options).toEqual([
      { id: "ing-1", name: "Flour", stockUnitId: "unit-kg", unitLabel: "kg" },
    ]);
    expect(recorded.filters).toEqual(
      expect.arrayContaining([
        { table: "inventory_items", column: "tenant_id", value: TENANT },
        { table: "inventory_items", column: "is_active", value: true },
      ]),
    );
  });

  it("returns an empty list without querying when the tenant is unknown", async () => {
    // Arrange — the auth store starts empty; a cold mount must not query
    const { db, recorded } = makeDb({});

    // Act
    const options = await loadIngredientOptions("", db);

    // Assert
    expect(options).toEqual([]);
    expect(recorded.filters).toHaveLength(0);
  });
});

describe("loadUnitOptions", () => {
  it("returns the tenant's unit catalog for the unit picker", async () => {
    // Arrange
    const { db, recorded } = makeDb({
      inventory_units: {
        data: [{ id: "unit-kg", abbreviation: "kg" }],
        error: null,
      },
    });

    // Act
    const units = await loadUnitOptions(TENANT, db);

    // Assert
    expect(units).toEqual([{ id: "unit-kg", abbreviation: "kg" }]);
    expect(recorded.filters).toEqual(
      expect.arrayContaining([
        { table: "inventory_units", column: "tenant_id", value: TENANT },
      ]),
    );
  });

  it("returns an empty list without querying when the tenant is unknown", async () => {
    // Arrange
    const { db, recorded } = makeDb({});

    // Act
    const units = await loadUnitOptions("", db);

    // Assert
    expect(units).toEqual([]);
    expect(recorded.filters).toHaveLength(0);
  });
});

describe("ensureMenuItemRecipe", () => {
  it("returns the existing recipe id without inserting a second one", async () => {
    // Arrange
    const { db, recorded } = makeDb({ recipes: { data: { id: "recipe-1" }, error: null } });

    // Act
    const id = await ensureMenuItemRecipe(TENANT, MENU_ITEM, db);

    // Assert
    expect(id).toBe("recipe-1");
    expect(recorded.inserts).toHaveLength(0);
  });

  it("creates the base recipe when the dish has none", async () => {
    // Arrange — first read finds nothing, the insert answers with the new row
    const { db, recorded } = makeDb({
      recipes: [
        { data: null, error: null },
        { data: { id: "recipe-new" }, error: null },
      ],
    });

    // Act
    const id = await ensureMenuItemRecipe(TENANT, MENU_ITEM, db);

    // Assert
    expect(id).toBe("recipe-new");
    expect(recorded.inserts).toEqual([
      {
        table: "recipes",
        row: {
          tenant_id: TENANT,
          target_type: "menu_item",
          menu_item_id: MENU_ITEM,
        },
      },
    ]);
  });

  it("throws a message worth showing when the insert is refused", async () => {
    // Arrange
    const { db } = makeDb({
      recipes: [
        { data: null, error: null },
        { data: null, error: { message: "row-level security" } },
      ],
    });

    // Act + Assert
    await expect(ensureMenuItemRecipe(TENANT, MENU_ITEM, db)).rejects.toThrow(
      /row-level security/,
    );
  });
});

describe("addRecipeComponent", () => {
  const input = {
    recipeId: "recipe-1",
    inventoryItemId: "ing-flour",
    quantity: 0.25,
    unitId: "unit-kg",
    sortOrder: 2,
  };

  it("inserts the line scoped to the tenant", async () => {
    // Arrange
    const { db, recorded } = makeDb({ recipe_components: { data: null, error: null } });

    // Act
    await addRecipeComponent(TENANT, input, db);

    // Assert
    expect(recorded.inserts).toEqual([
      {
        table: "recipe_components",
        row: {
          tenant_id: TENANT,
          recipe_id: "recipe-1",
          inventory_item_id: "ing-flour",
          quantity: 0.25,
          unit_id: "unit-kg",
          sort_order: 2,
        },
      },
    ]);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses quantity %p before touching the database",
    async (quantity) => {
      // Arrange
      const { db, recorded } = makeDb({});

      // Act + Assert
      await expect(
        addRecipeComponent(TENANT, { ...input, quantity }, db),
      ).rejects.toThrow(/quantity/i);
      expect(recorded.inserts).toHaveLength(0);
    },
  );

  it("surfaces a refused insert", async () => {
    // Arrange
    const { db } = makeDb({
      recipe_components: { data: null, error: { message: "denied" } },
    });

    // Act + Assert
    await expect(addRecipeComponent(TENANT, input, db)).rejects.toThrow(/denied/);
  });
});

describe("updateRecipeComponent", () => {
  it("updates quantity and unit scoped to tenant and line", async () => {
    // Arrange
    const { db, recorded } = makeDb({ recipe_components: { data: null, error: null } });

    // Act
    await updateRecipeComponent(TENANT, "comp-1", { quantity: 2, unitId: "unit-g" }, db);

    // Assert
    expect(recorded.updates).toEqual([
      { table: "recipe_components", row: { quantity: 2, unit_id: "unit-g" } },
    ]);
    expect(recorded.filters).toEqual(
      expect.arrayContaining([
        { table: "recipe_components", column: "tenant_id", value: TENANT },
        { table: "recipe_components", column: "id", value: "comp-1" },
      ]),
    );
  });

  it("refuses a non-positive quantity before touching the database", async () => {
    // Arrange
    const { db, recorded } = makeDb({});

    // Act + Assert
    await expect(
      updateRecipeComponent(TENANT, "comp-1", { quantity: 0, unitId: "unit-g" }, db),
    ).rejects.toThrow(/quantity/i);
    expect(recorded.updates).toHaveLength(0);
  });
});

describe("removeRecipeComponent", () => {
  it("deletes the line scoped to tenant and id", async () => {
    // Arrange
    const { db, recorded } = makeDb({ recipe_components: { data: null, error: null } });

    // Act
    await removeRecipeComponent(TENANT, "comp-1", db);

    // Assert
    expect(recorded.deletes).toEqual([{ table: "recipe_components" }]);
    expect(recorded.filters).toEqual(
      expect.arrayContaining([
        { table: "recipe_components", column: "tenant_id", value: TENANT },
        { table: "recipe_components", column: "id", value: "comp-1" },
      ]),
    );
  });

  it("surfaces a refused delete", async () => {
    // Arrange
    const { db } = makeDb({
      recipe_components: { data: null, error: { message: "denied" } },
    });

    // Act + Assert
    await expect(removeRecipeComponent(TENANT, "comp-1", db)).rejects.toThrow(/denied/);
  });
});
