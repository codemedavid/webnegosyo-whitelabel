import {
  buildRecipeTargetColumns,
  dishRecipeChoices,
  isOptionTargetType,
  optionTarget,
  targetKey,
} from "./recipe-target";

describe("buildRecipeTargetColumns", () => {
  it.each([
    [{ type: "menu_item" as const, menuItemId: "m" }, { target_type: "menu_item", menu_item_id: "m", variation_option_id: null, addon_id: null, modifier_option_id: null }],
    [optionTarget("m", "modifier_option", "o1"), { target_type: "modifier_option", menu_item_id: "m", variation_option_id: null, addon_id: null, modifier_option_id: "o1" }],
    [optionTarget("m", "variation_option", "v1"), { target_type: "variation_option", menu_item_id: "m", variation_option_id: "v1", addon_id: null, modifier_option_id: null }],
    [optionTarget("m", "addon", "a1"), { target_type: "addon", menu_item_id: "m", variation_option_id: null, addon_id: "a1", modifier_option_id: null }],
  ])("keys %j on its own id column only", (target, expected) => {
    expect(buildRecipeTargetColumns(target)).toEqual(expected);
  });

  it("refuses a blank id instead of writing a recipe nothing can match", () => {
    expect(() => buildRecipeTargetColumns(optionTarget("m", "addon", "  "))).toThrow(/Addon/);
    expect(() => buildRecipeTargetColumns({ type: "menu_item", menuItemId: "" })).toThrow(/Menu item/);
  });
});

describe("targetKey / isOptionTargetType", () => {
  it("keys a target uniquely within its dish", () => {
    expect(targetKey({ type: "menu_item", menuItemId: "m" })).toBe("menu_item");
    expect(targetKey(optionTarget("m", "addon", "a1"))).toBe("addon:a1");
    expect(targetKey(optionTarget("m", "modifier_option", "a1"))).toBe("modifier_option:a1");
  });

  it("accepts only the three choice kinds", () => {
    expect(isOptionTargetType("addon")).toBe(true);
    expect(isOptionTargetType("menu_item")).toBe(false);
    expect(isOptionTargetType("prep_item")).toBe(false);
  });
});

describe("dishRecipeChoices", () => {
  it("offers a modifier-group dish's options as modifier options, ignoring mirrored legacy add-ons", () => {
    const groups = dishRecipeChoices("m", {
      modifier_groups: [
        {
          id: "g1",
          name: "Pick your flavours",
          display_order: 0,
          min_select: 1,
          max_select: 100,
          options: [
            { id: "o2", name: "Teriyaki", price_modifier: 0, display_order: 1 },
            { id: "o1", name: "BBQ", price_modifier: 0, display_order: 0 },
          ],
        },
      ],
      addons: [{ id: "o1", name: "BBQ", price: 0 }],
    });

    expect(groups).toEqual([
      {
        id: "g1",
        name: "Pick your flavours",
        choices: [
          { optionId: "o1", name: "BBQ", target: optionTarget("m", "modifier_option", "o1") },
          { optionId: "o2", name: "Teriyaki", target: optionTarget("m", "modifier_option", "o2") },
        ],
      },
    ]);
  });

  it("offers legacy grouped variations as variation options and legacy add-ons as add-ons", () => {
    const groups = dishRecipeChoices("m", {
      variation_types: [
        {
          id: "t1",
          name: "Size",
          is_required: true,
          display_order: 0,
          options: [{ id: "v1", name: "Large", price_modifier: 20, display_order: 0 }],
        },
      ],
      addons: [{ id: "a1", name: "Egg", price: 15 }],
    });

    expect(groups.map((g) => g.choices.map((c) => c.target.type))).toEqual([["variation_option"], ["addon"]]);
  });

  it("offers flat legacy variations as variation options", () => {
    const groups = dishRecipeChoices("m", { variations: [{ id: "v1", name: "Small", price_modifier: 0 }] });
    expect(groups[0].choices[0].target).toEqual(optionTarget("m", "variation_option", "v1"));
  });

  it("returns nothing for a dish without choices, and skips options without an id", () => {
    expect(dishRecipeChoices("m", {})).toEqual([]);
    expect(dishRecipeChoices("m", { addons: [{ id: "", name: "Ghost", price: 0 }] })).toEqual([]);
  });
});
