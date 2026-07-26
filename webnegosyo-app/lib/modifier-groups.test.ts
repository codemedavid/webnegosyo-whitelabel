import {
  normalizeModifierGroups,
  validateModifierGroups,
  serializeModifierGroups,
  splitGroupsToLegacyColumns,
  LEGACY_ADDON_GROUP_NAME,
  LEGACY_VARIATION_GROUP_NAME,
  type ModifierGroup,
} from "./modifier-groups";

const sizeGroup: ModifierGroup = {
  id: "g-size",
  name: "Size",
  display_order: 0,
  min_select: 1,
  max_select: 1,
  options: [
    { id: "o-s", name: "Small", price_modifier: 0, display_order: 0 },
    { id: "o-l", name: "Large", price_modifier: 20, display_order: 1 },
  ],
};

describe("normalizeModifierGroups", () => {
  it("returns explicit modifier_groups untouched (sorted)", () => {
    const groups = normalizeModifierGroups({ modifier_groups: [sizeGroup] } as any);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("Size");
    expect(groups[0].options.map((o) => o.name)).toEqual(["Small", "Large"]);
  });

  it("derives a single-select group from grouped variation_types", () => {
    const groups = normalizeModifierGroups({
      variation_types: [
        {
          id: "vt-1",
          name: "Spice",
          is_required: true,
          display_order: 0,
          options: [
            { id: "vo-1", name: "Mild", price_modifier: 0, display_order: 0 },
            { id: "vo-2", name: "Hot", price_modifier: 5, display_order: 1 },
          ],
        },
      ],
    } as any);
    expect(groups).toHaveLength(1);
    expect(groups[0].max_select).toBe(1);
    expect(groups[0].min_select).toBe(1);
  });

  it("derives an unlimited multi-select group from legacy addons", () => {
    const groups = normalizeModifierGroups({
      addons: [{ id: "a1", name: "Extra Cheese", price: 20 }],
    } as any);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe(LEGACY_ADDON_GROUP_NAME);
    expect(groups[0].max_select).toBeNull();
    expect(groups[0].options[0].price_modifier).toBe(20);
  });

  it("derives a single-select group from legacy flat variations", () => {
    const groups = normalizeModifierGroups({
      variations: [
        { id: "v1", name: "Regular", price_modifier: 0 },
        { id: "v2", name: "Jumbo", price_modifier: 15 },
      ],
    } as any);
    expect(groups[0].name).toBe(LEGACY_VARIATION_GROUP_NAME);
    expect(groups[0].max_select).toBe(1);
  });

  it("returns an empty array when the item has no modifier data", () => {
    expect(normalizeModifierGroups({} as any)).toEqual([]);
  });
});

describe("validateModifierGroups", () => {
  it("accepts a well-formed group", () => {
    const result = validateModifierGroups([sizeGroup]);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it("accepts an empty list (options are optional on a product)", () => {
    expect(validateModifierGroups([]).valid).toBe(true);
  });

  it("rejects a group with a blank name", () => {
    const result = validateModifierGroups([{ ...sizeGroup, name: "  " }]);
    expect(result.valid).toBe(false);
    expect(result.errors["g-size"]).toBeDefined();
  });

  it("rejects a group with no options", () => {
    const result = validateModifierGroups([{ ...sizeGroup, options: [] }]);
    expect(result.valid).toBe(false);
    expect(result.errors["g-size"]).toBeDefined();
  });

  it("rejects a group with a blank option name", () => {
    const result = validateModifierGroups([
      {
        ...sizeGroup,
        options: [{ id: "o-s", name: "", price_modifier: 0, display_order: 0 }],
      },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors["g-size"]).toBeDefined();
  });

  it("rejects when min_select exceeds the number of options", () => {
    const result = validateModifierGroups([{ ...sizeGroup, min_select: 5 }]);
    expect(result.valid).toBe(false);
  });

  it("rejects when max_select is less than min_select", () => {
    const result = validateModifierGroups([
      { ...sizeGroup, min_select: 2, max_select: 1 },
    ]);
    expect(result.valid).toBe(false);
  });

  it("rejects a finite max_select below 1", () => {
    const result = validateModifierGroups([{ ...sizeGroup, min_select: 0, max_select: 0 }]);
    expect(result.valid).toBe(false);
  });

  it("accepts an unlimited group (max_select null)", () => {
    const result = validateModifierGroups([
      { ...sizeGroup, min_select: 0, max_select: null },
    ]);
    expect(result.valid).toBe(true);
  });
});

describe("serializeModifierGroups", () => {
  it("reassigns sequential display_order to groups and their options", () => {
    const scrambled: ModifierGroup[] = [
      { ...sizeGroup, display_order: 99 },
      {
        id: "g-addon",
        name: "Add-ons",
        display_order: 3,
        min_select: 0,
        max_select: null,
        options: [
          { id: "x", name: "Bacon", price_modifier: 30, display_order: 7 },
          { id: "y", name: "Egg", price_modifier: 15, display_order: 2 },
        ],
      },
    ];
    const out = serializeModifierGroups(scrambled);
    expect(out[0].display_order).toBe(0);
    expect(out[1].display_order).toBe(1);
    expect(out[1].options[0].display_order).toBe(0);
    expect(out[1].options[1].display_order).toBe(1);
  });

  it("does not mutate the input groups", () => {
    const input: ModifierGroup[] = [{ ...sizeGroup, display_order: 42 }];
    serializeModifierGroups(input);
    expect(input[0].display_order).toBe(42);
  });
});

const addonGroup: ModifierGroup = {
  id: "g-addon",
  name: "Add-ons",
  display_order: 1,
  min_select: 0,
  max_select: null,
  options: [
    { id: "o-cheese", name: "Extra Cheese", price_modifier: 20, display_order: 0 },
    { id: "o-bacon", name: "Bacon", price_modifier: 30, display_order: 1 },
  ],
};

describe("splitGroupsToLegacyColumns", () => {
  it("mirrors a single-select group into variation_types", () => {
    const legacy = splitGroupsToLegacyColumns([sizeGroup]);

    expect(legacy.variation_types).toEqual([
      {
        id: "g-size",
        name: "Size",
        is_required: true,
        display_order: 0,
        options: [
          {
            id: "o-s",
            name: "Small",
            price_modifier: 0,
            image_url: undefined,
            is_default: undefined,
            display_order: 0,
          },
          {
            id: "o-l",
            name: "Large",
            price_modifier: 20,
            image_url: undefined,
            is_default: undefined,
            display_order: 1,
          },
        ],
      },
    ]);
    expect(legacy.addons).toEqual([]);
  });

  it("flattens a multi-select group's options into addons", () => {
    const legacy = splitGroupsToLegacyColumns([addonGroup]);

    expect(legacy.variation_types).toEqual([]);
    expect(legacy.addons).toEqual([
      { id: "o-cheese", name: "Extra Cheese", price: 20, is_default: undefined },
      { id: "o-bacon", name: "Bacon", price: 30, is_default: undefined },
    ]);
  });

  it("treats a finite cap above one as multi-select", () => {
    const legacy = splitGroupsToLegacyColumns([{ ...addonGroup, max_select: 3 }]);

    expect(legacy.variation_types).toEqual([]);
    expect(legacy.addons).toHaveLength(2);
  });

  it("marks an optional single-select group as not required", () => {
    const legacy = splitGroupsToLegacyColumns([{ ...sizeGroup, min_select: 0 }]);

    expect(legacy.variation_types[0].is_required).toBe(false);
  });

  it("splits a mixed list into both legacy columns", () => {
    const legacy = splitGroupsToLegacyColumns([sizeGroup, addonGroup]);

    expect(legacy.variation_types.map((v) => v.name)).toEqual(["Size"]);
    expect(legacy.addons.map((a) => a.name)).toEqual(["Extra Cheese", "Bacon"]);
  });

  it("always clears the oldest flat variations column", () => {
    expect(splitGroupsToLegacyColumns([sizeGroup]).variations).toEqual([]);
  });

  it("returns empty columns for no groups, so removals clear the legacy data", () => {
    expect(splitGroupsToLegacyColumns([])).toEqual({
      variation_types: [],
      variations: [],
      addons: [],
    });
  });

  it("does not mutate the input groups", () => {
    const input: ModifierGroup[] = [{ ...addonGroup }];
    splitGroupsToLegacyColumns(input);
    expect(input[0].options).toHaveLength(2);
    expect(input[0].max_select).toBeNull();
  });
});
