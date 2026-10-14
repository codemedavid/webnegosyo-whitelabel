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

import { optionTarget } from "./recipe-target";
import {
  addRecipeComponent,
  ensureMenuItemRecipe,
  ensureRecipe,
  loadDishRecipeChoices,
  loadDishRecipeCoverage,
  loadRecipe,
  loadDishName,
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
    chain.in = (column: string, value: unknown) => {
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
    const { db, recorded } = makeDb({ recipe_components: { data: [{ id: "comp-new" }], error: null } });

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
    const { db, recorded } = makeDb({ recipe_components: { data: [{ id: "comp-1" }], error: null } });

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

describe("silent refusals", () => {
  it("reports an update that changed no row (RLS refusal reads as zero rows)", async () => {
    // Arrange
    const { db } = makeDb({ recipe_components: { data: [], error: null } });

    // Act + Assert
    await expect(
      updateRecipeComponent(TENANT, "comp-1", { quantity: 2, unitId: "unit-g" }, db),
    ).rejects.toThrow(/could not be updated/);
  });

  it("reports a delete that removed no row", async () => {
    // Arrange
    const { db } = makeDb({ recipe_components: { data: [], error: null } });

    // Act + Assert
    await expect(removeRecipeComponent(TENANT, "comp-1", db)).rejects.toThrow(/could not be removed/);
  });
});

describe("removeRecipeComponent", () => {
  it("deletes the line scoped to tenant and id", async () => {
    // Arrange
    const { db, recorded } = makeDb({ recipe_components: { data: [{ id: "comp-1" }], error: null } });

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

describe("loadDishName", () => {
  it("reads the dish's name scoped to tenant and item", async () => {
    // Arrange
    const { db, recorded } = makeDb({ menu_items: { data: { name: "Iced Latte" }, error: null } });

    // Act
    const name = await loadDishName(TENANT, MENU_ITEM, db);

    // Assert
    expect(name).toBe("Iced Latte");
    expect(recorded.filters).toEqual(
      expect.arrayContaining([
        { table: "menu_items", column: "tenant_id", value: TENANT },
        { table: "menu_items", column: "id", value: MENU_ITEM },
      ]),
    );
  });

  it("costs the label, not the screen, when the read fails", async () => {
    // Arrange
    const { db } = makeDb({ menu_items: { data: null, error: { message: "timeout" } } });

    // Act + Assert — a header without a name beats an editor that will not open
    await expect(loadDishName(TENANT, MENU_ITEM, db)).resolves.toBe("");
  });

  it("returns blank without querying when the tenant is unknown", async () => {
    // Arrange
    const { db, recorded } = makeDb({});

    // Act
    const name = await loadDishName("", MENU_ITEM, db);

    // Assert
    expect(name).toBe("");
    expect(recorded.filters).toHaveLength(0);
  });
});

describe("choice recipes", () => {
  const FLAVOUR = optionTarget(MENU_ITEM, "modifier_option", "opt-bbq");

  it("looks a modifier option's recipe up by its own id column", async () => {
    // Arrange
    const { db, recorded } = makeDb({ recipes: { data: null, error: null } });

    // Act
    await loadRecipe(TENANT, FLAVOUR, db);

    // Assert
    expect(recorded.filters).toEqual(
      expect.arrayContaining([
        { table: "recipes", column: "tenant_id", value: TENANT },
        { table: "recipes", column: "menu_item_id", value: MENU_ITEM },
        { table: "recipes", column: "target_type", value: "modifier_option" },
        { table: "recipes", column: "modifier_option_id", value: "opt-bbq" },
      ]),
    );
  });

  it.each([
    [optionTarget(MENU_ITEM, "modifier_option", "o1"), { modifier_option_id: "o1" }],
    [optionTarget(MENU_ITEM, "variation_option", "v1"), { variation_option_id: "v1" }],
    [optionTarget(MENU_ITEM, "addon", "a1"), { addon_id: "a1" }],
  ])("creates a %j recipe with only its own id column", async (target, idColumn) => {
    // Arrange
    const { db, recorded } = makeDb({
      recipes: [
        { data: null, error: null },
        { data: { id: "recipe-new" }, error: null },
      ],
    });

    // Act
    const id = await ensureRecipe(TENANT, target, db);

    // Assert
    expect(id).toBe("recipe-new");
    expect(recorded.inserts).toEqual([
      {
        table: "recipes",
        row: { tenant_id: TENANT, target_type: target.type, menu_item_id: MENU_ITEM, ...idColumn },
      },
    ]);
  });
});

describe("line validation", () => {
  const units = [
    { id: "unit-pc", abbreviation: "pc", dimension: "count" as const },
    { id: "unit-g", abbreviation: "g", dimension: "weight" as const },
    { id: "unit-ml", abbreviation: "ml", dimension: "volume" as const },
  ];
  const egg = { name: "Egg", stockUnitId: "unit-pc" };
  const milk = { name: "Milk", stockUnitId: "unit-ml" };
  const line = { recipeId: "r", inventoryItemId: "ing-egg", quantity: 50, unitId: "unit-g", sortOrder: 0 };

  it("refuses a unit that can never convert to the stock unit, before writing", async () => {
    const { db, recorded } = makeDb({});
    await expect(addRecipeComponent(TENANT, { ...line, check: { ingredient: egg, units } }, db)).rejects.toThrow(
      /stocked in pc/,
    );
    expect(recorded.inserts).toHaveLength(0);
  });

  it("accepts grams of an ingredient stocked in millilitres", async () => {
    const { db, recorded } = makeDb({ recipe_components: { data: [{ id: "c" }], error: null } });
    await addRecipeComponent(TENANT, { ...line, check: { ingredient: milk, units } }, db);
    expect(recorded.inserts).toHaveLength(1);
  });

  it("refuses an update to an unconvertible unit", async () => {
    const { db, recorded } = makeDb({});
    await expect(
      updateRecipeComponent(TENANT, "c", { quantity: 2, unitId: "unit-g", check: { ingredient: egg, units } }, db),
    ).rejects.toThrow(/can't be measured in g/);
    expect(recorded.updates).toHaveLength(0);
  });

  it("reports an insert that wrote no row (an RLS refusal reads as zero rows)", async () => {
    const { db } = makeDb({ recipe_components: { data: [], error: null } });
    await expect(addRecipeComponent(TENANT, line, db)).rejects.toThrow(/could not be added/);
  });
});

describe("loadUnitOptions dimension", () => {
  it("carries each unit's dimension so the picker can be filtered", async () => {
    const { db } = makeDb({
      inventory_units: { data: [{ id: "g", abbreviation: "g", dimension: "weight" }, { id: "x", abbreviation: "x", dimension: "bogus" }], error: null },
    });
    await expect(loadUnitOptions(TENANT, db)).resolves.toEqual([
      { id: "g", abbreviation: "g", dimension: "weight" },
      { id: "x", abbreviation: "x" },
    ]);
  });
});

describe("loadDishRecipeChoices", () => {
  it("reads the dish's choices scoped to tenant and item", async () => {
    // Arrange
    const { db, recorded } = makeDb({
      menu_items: {
        data: {
          name: "699 - Beef Flavor",
          modifier_groups: [
            {
              id: "g1",
              name: "Flavours",
              display_order: 0,
              min_select: 1,
              max_select: 100,
              options: [{ id: "o1", name: "Beef BBQ", price_modifier: 0, display_order: 0 }],
            },
          ],
        },
        error: null,
      },
    });

    // Act
    const choices = await loadDishRecipeChoices(TENANT, MENU_ITEM, db);

    // Assert
    expect(choices.name).toBe("699 - Beef Flavor");
    expect(choices.groups[0].choices[0]).toEqual({
      optionId: "o1",
      name: "Beef BBQ",
      target: optionTarget(MENU_ITEM, "modifier_option", "o1"),
    });
    expect(recorded.filters).toEqual(
      expect.arrayContaining([
        { table: "menu_items", column: "tenant_id", value: TENANT },
        { table: "menu_items", column: "id", value: MENU_ITEM },
      ]),
    );
  });

  it("costs the choices, not the screen, when the dish cannot be read", async () => {
    const { db } = makeDb({ menu_items: { data: null, error: { message: "boom" } } });
    await expect(loadDishRecipeChoices(TENANT, MENU_ITEM, db)).resolves.toEqual({ name: "", groups: [] });
  });
});

describe("loadDishRecipeCoverage", () => {
  it("counts lines per target and leaves out empty recipes", async () => {
    // Arrange
    const { db, recorded } = makeDb({
      recipes: {
        data: [
          { id: "r-base", target_type: "menu_item", variation_option_id: null, addon_id: null, modifier_option_id: null },
          { id: "r-bbq", target_type: "modifier_option", variation_option_id: null, addon_id: null, modifier_option_id: "o1" },
          { id: "r-empty", target_type: "addon", variation_option_id: null, addon_id: "a1", modifier_option_id: null },
        ],
        error: null,
      },
      recipe_components: {
        data: [{ recipe_id: "r-base" }, { recipe_id: "r-base" }, { recipe_id: "r-bbq" }],
        error: null,
      },
    });

    // Act
    const coverage = await loadDishRecipeCoverage(TENANT, MENU_ITEM, db);

    // Assert
    expect(coverage).toEqual({ menu_item: 2, "modifier_option:o1": 1 });
    expect(recorded.filters).toEqual(
      expect.arrayContaining([
        { table: "recipe_components", column: "tenant_id", value: TENANT },
        { table: "recipe_components", column: "recipe_id", value: ["r-base", "r-bbq", "r-empty"] },
      ]),
    );
  });

  it("answers null rather than throwing when it cannot be read", async () => {
    const { db } = makeDb({ recipes: { data: null, error: { message: "boom" } } });
    await expect(loadDishRecipeCoverage(TENANT, MENU_ITEM, db)).resolves.toBeNull();
  });
});
