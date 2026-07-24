import {
  normalizeModifierGroups,
  validateModifierGroups,
  serializeModifierGroups,
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
