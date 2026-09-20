/**
 * Managing the store's menu categories from the merchant app.
 *
 * Two things here are load-bearing and neither is visible from the screen.
 *
 * The first is that an edit writes ONLY the columns the app's form owns. A
 * category row also carries `order`, `display_layout`, `card_template` and
 * `default_addons` — arranged, chosen and filled in on the web Branding Studio,
 * which this app has no editor for. Sending a whole row back would reset all
 * four to defaults, so renaming a category on a phone would silently flatten a
 * merchant's storefront layout. (The web hit exactly this and grew
 * `updateCategoryFields` for it.)
 *
 * The second is that `order` is what the storefront sorts categories by, so a
 * move that reorders the on-screen array without renumbering every position
 * looks right here and changes nothing for the customer.
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
  EMPTY_CATEGORY_INPUT,
  buildCategoryEditorState,
  countProductsIn,
  createCategory,
  deleteCategory,
  getCategory,
  listManagedCategories,
  moveCategory,
  reorderCategories,
  toggleCategoryActive,
  updateCategory,
  validateCategoryInput,
  type CategoryInput,
  type ManagedCategory,
} from "./categories";

function argsFor(method: string): unknown[][] {
  return calls.filter((c) => c.method === method).map((c) => c.args);
}

function tablesTouched(): string[] {
  return argsFor("from").map((a) => String(a[0]));
}

const VALID_INPUT: CategoryInput = {
  name: "Rice Meals",
  description: "Served with garlic rice",
  icon: "lucide:soup",
  icon_color: "#FF6B00",
  is_active: true,
};

function category(overrides: Partial<ManagedCategory> = {}): ManagedCategory {
  return {
    id: "cat-1",
    tenant_id: "tenant-1",
    name: "Rice Meals",
    description: null,
    icon: null,
    icon_color: null,
    order: 0,
    is_active: true,
    ...overrides,
  };
}

beforeEach(() => {
  calls.length = 0;
  queued = [];
});

describe("validateCategoryInput", () => {
  it("accepts a filled-in category", () => {
    expect(validateCategoryInput(VALID_INPUT)).toEqual({ valid: true, errors: {} });
  });

  it("rejects a name shorter than the web admin accepts", () => {
    const result = validateCategoryInput({ ...VALID_INPUT, name: "R" });

    expect(result.valid).toBe(false);
    expect(result.errors.name).toBeTruthy();
  });

  it("accepts a category with no icon at all", () => {
    expect(validateCategoryInput({ ...VALID_INPUT, icon: "", icon_color: "" }).valid).toBe(true);
  });

  it("accepts a raw emoji, which merchants set before the icon library existed", () => {
    expect(validateCategoryInput({ ...VALID_INPUT, icon: "🍜" }).valid).toBe(true);
  });

  /*
    The storefront resolves `lucide:*` through a static map and renders NOTHING
    for a name it does not know, so an unvetted name is an invisible icon. The
    refusal has to happen here, at write time.
  */
  it("rejects a lucide name the storefront cannot render", () => {
    const result = validateCategoryInput({ ...VALID_INPUT, icon: "lucide:not-an-icon" });

    expect(result.valid).toBe(false);
    expect(result.errors.icon).toBeTruthy();
  });

  it("rejects a tint the storefront cannot read", () => {
    const result = validateCategoryInput({ ...VALID_INPUT, icon_color: "orange" });

    expect(result.valid).toBe(false);
    expect(result.errors.icon_color).toBeTruthy();
  });
});

describe("buildCategoryEditorState", () => {
  it("starts a new category from a clean slate", () => {
    expect(buildCategoryEditorState(null).form).toEqual(EMPTY_CATEGORY_INPUT);
  });

  /*
    The editor is pushed onto a tab stack that is never unmounted, so the same
    screen instance serves "edit this one" and then "add a new one". A leaked
    field here re-saves the previous category's icon onto the new one.
  */
  it("never leaks the previously edited category into a new one", () => {
    buildCategoryEditorState(category({ name: "Drinks", icon: "lucide:coffee" }));

    expect(buildCategoryEditorState(null).form).toEqual(EMPTY_CATEGORY_INPUT);
  });

  it("fills the form from a loaded category", () => {
    const state = buildCategoryEditorState(
      category({ name: "Drinks", description: "Cold", icon: "lucide:coffee", icon_color: "#00AAFF", is_active: false }),
    );

    expect(state.form).toEqual({
      name: "Drinks",
      description: "Cold",
      icon: "lucide:coffee",
      icon_color: "#00AAFF",
      is_active: false,
    });
  });

  it("reads a category with nothing filled in as empty text, not as null", () => {
    const state = buildCategoryEditorState(category());

    expect(state.form.description).toBe("");
    expect(state.form.icon).toBe("");
    expect(state.form.icon_color).toBe("");
  });
});

describe("moveCategory", () => {
  const list = [
    category({ id: "a", order: 0 }),
    category({ id: "b", order: 1 }),
    category({ id: "c", order: 2 }),
  ];

  it("swaps a category with the one above it", () => {
    expect(moveCategory(list, "b", "up").map((c) => c.id)).toEqual(["b", "a", "c"]);
  });

  it("swaps a category with the one below it", () => {
    expect(moveCategory(list, "b", "down").map((c) => c.id)).toEqual(["a", "c", "b"]);
  });

  /*
    Renumbering, not just reordering: `order` is the column the storefront sorts
    by, and a swap that left the old numbers attached would look correct on this
    screen and change nothing on the menu.
  */
  it("renumbers every position so the storefront sorts the new way", () => {
    expect(moveCategory(list, "c", "up").map((c) => c.order)).toEqual([0, 1, 2]);
    expect(moveCategory(list, "c", "up").map((c) => c.id)).toEqual(["a", "c", "b"]);
  });

  it("leaves the ends alone", () => {
    expect(moveCategory(list, "a", "up").map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(moveCategory(list, "c", "down").map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the caller's list", () => {
    const original = [...list];
    moveCategory(list, "b", "up");

    expect(list).toEqual(original);
  });

  it("renumbers a list that arrives with gaps, and keeps unknown ids harmless", () => {
    const gappy = [category({ id: "a", order: 3 }), category({ id: "b", order: 9 })];

    expect(moveCategory(gappy, "missing", "up").map((c) => c.order)).toEqual([0, 1]);
  });
});

describe("listManagedCategories", () => {
  it("reads the store's categories in menu order", async () => {
    queued = [{ data: [category()], error: null }];

    const result = await listManagedCategories("tenant-1");

    expect(tablesTouched()).toEqual(["categories"]);
    expect(argsFor("eq")).toContainEqual(["tenant_id", "tenant-1"]);
    expect(argsFor("order")).toContainEqual(["order", { ascending: true }]);
    expect(result).toHaveLength(1);
  });

  /*
    An inactive category is exactly the row a merchant opens this screen to find
    and switch back on. Filtering it out would read as the category having been
    deleted — the same reasoning as the payment-methods management read.
  */
  it("keeps hidden categories, which are the ones the merchant came to fix", async () => {
    queued = [{ data: [category({ id: "hidden", is_active: false })], error: null }];

    const result = await listManagedCategories("tenant-1");

    expect(result.map((c) => c.id)).toEqual(["hidden"]);
  });

  it("throws rather than reporting a store with no categories", async () => {
    queued = [{ data: null, error: { message: "network down" } }];

    await expect(listManagedCategories("tenant-1")).rejects.toBeTruthy();
  });
});

describe("createCategory", () => {
  it("writes the new category to the end of the menu", async () => {
    queued = [
      { data: { order: 4 }, error: null },
      { data: category({ order: 5 }), error: null },
    ];

    await createCategory("tenant-1", VALID_INPUT);

    const inserted = argsFor("insert")[0][0] as Record<string, unknown>;
    expect(inserted.tenant_id).toBe("tenant-1");
    expect(inserted.name).toBe("Rice Meals");
    expect(inserted.order).toBe(5);
  });

  it("starts the first category of a brand-new store at position zero", async () => {
    queued = [
      { data: null, error: null },
      { data: category(), error: null },
    ];

    await createCategory("tenant-1", VALID_INPUT);

    expect((argsFor("insert")[0][0] as Record<string, unknown>).order).toBe(0);
  });

  it("refuses an invalid category before touching the database", async () => {
    await expect(createCategory("tenant-1", { ...VALID_INPUT, name: "" })).rejects.toThrow();

    expect(tablesTouched()).toEqual([]);
  });

  it("stores blank text as NULL so 'no description' is one value, not two", async () => {
    queued = [
      { data: null, error: null },
      { data: category(), error: null },
    ];

    await createCategory("tenant-1", { ...VALID_INPUT, description: "  ", icon: "", icon_color: "" });

    const inserted = argsFor("insert")[0][0] as Record<string, unknown>;
    expect(inserted.description).toBeNull();
    expect(inserted.icon).toBeNull();
    expect(inserted.icon_color).toBeNull();
  });
});

describe("updateCategory", () => {
  it("writes only the fields this app's form owns", async () => {
    queued = [{ data: category(), error: null }];

    await updateCategory("cat-1", "tenant-1", VALID_INPUT);

    const patch = argsFor("update")[0][0] as Record<string, unknown>;
    expect(Object.keys(patch).sort()).toEqual(
      ["description", "icon", "icon_color", "is_active", "name"].sort(),
    );
  });

  /*
    The four columns below are set on the web (arrangement, layout, per-category
    card template, default add-ons) and have no editor here. Naming them in the
    payload — even as "keep what you had" — is what reset a merchant's
    storefront layout the last time this was written as a whole-row save.
  */
  it("never touches the columns only the web Branding Studio edits", async () => {
    queued = [{ data: category(), error: null }];

    await updateCategory("cat-1", "tenant-1", VALID_INPUT);

    const patch = argsFor("update")[0][0] as Record<string, unknown>;
    for (const column of ["order", "display_layout", "card_template", "default_addons"]) {
      expect(patch).not.toHaveProperty(column);
    }
  });

  it("scopes the write to the caller's own store", async () => {
    queued = [{ data: category(), error: null }];

    await updateCategory("cat-1", "tenant-1", VALID_INPUT);

    expect(argsFor("eq")).toContainEqual(["id", "cat-1"]);
    expect(argsFor("eq")).toContainEqual(["tenant_id", "tenant-1"]);
  });

  it("refuses an invalid edit before touching the database", async () => {
    await expect(
      updateCategory("cat-1", "tenant-1", { ...VALID_INPUT, icon: "lucide:nope" }),
    ).rejects.toThrow();

    expect(tablesTouched()).toEqual([]);
  });
});

describe("toggleCategoryActive", () => {
  it("writes the visibility flag and nothing else", async () => {
    queued = [{ data: category({ is_active: false }), error: null }];

    await toggleCategoryActive("cat-1", "tenant-1", false);

    expect(argsFor("update")[0][0]).toEqual({ is_active: false });
  });
});

describe("countProductsIn", () => {
  /*
    `menu_items.category_id` is `ON DELETE SET NULL`, so deleting a category
    does not delete its dishes — it orphans them, and an orphaned dish sits in
    no section of the menu and stops being orderable. The screen has to be able
    to say how many before asking.
  */
  it("counts the dishes a delete would orphan", async () => {
    queued = [{ data: [{ id: "item-1" }, { id: "item-2" }], error: null }];

    const count = await countProductsIn("cat-1", "tenant-1");

    expect(tablesTouched()).toEqual(["menu_items"]);
    expect(argsFor("eq")).toContainEqual(["category_id", "cat-1"]);
    expect(argsFor("eq")).toContainEqual(["tenant_id", "tenant-1"]);
    expect(count).toBe(2);
  });

  it("throws rather than reporting an empty category it could not read", async () => {
    queued = [{ data: null, error: { message: "network down" } }];

    await expect(countProductsIn("cat-1", "tenant-1")).rejects.toBeTruthy();
  });
});

describe("deleteCategory", () => {
  it("deletes only within the caller's own store", async () => {
    queued = [{ data: null, error: null }];

    await deleteCategory("cat-1", "tenant-1");

    expect(tablesTouched()).toEqual(["categories"]);
    expect(argsFor("eq")).toContainEqual(["id", "cat-1"]);
    expect(argsFor("eq")).toContainEqual(["tenant_id", "tenant-1"]);
  });

  it("surfaces a refused delete instead of reporting success", async () => {
    queued = [{ data: null, error: { message: "row level security" } }];

    await expect(deleteCategory("cat-1", "tenant-1")).rejects.toBeTruthy();
  });
});

describe("reorderCategories", () => {
  it("persists every position produced by the move", async () => {
    queued = [
      { data: null, error: null },
      { data: null, error: null },
    ];

    await reorderCategories("tenant-1", [
      category({ id: "b", order: 0 }),
      category({ id: "a", order: 1 }),
    ]);

    expect(argsFor("update")).toEqual([[{ order: 0 }], [{ order: 1 }]]);
    expect(argsFor("eq")).toContainEqual(["id", "b"]);
    expect(argsFor("eq")).toContainEqual(["id", "a"]);
  });

  it("stops at the first refused write rather than leaving a half-applied order", async () => {
    queued = [{ data: null, error: { message: "row level security" } }];

    await expect(
      reorderCategories("tenant-1", [category({ id: "b" }), category({ id: "a" })]),
    ).rejects.toBeTruthy();
  });
});

describe("getCategory", () => {
  it("reads one category of the caller's own store", async () => {
    queued = [{ data: category(), error: null }];

    const found = await getCategory("cat-1", "tenant-1");

    expect(argsFor("eq")).toContainEqual(["id", "cat-1"]);
    expect(argsFor("eq")).toContainEqual(["tenant_id", "tenant-1"]);
    expect(found?.id).toBe("cat-1");
  });

  it("answers null for a category that is not there", async () => {
    queued = [{ data: null, error: null }];

    expect(await getCategory("gone", "tenant-1")).toBeNull();
  });
});
