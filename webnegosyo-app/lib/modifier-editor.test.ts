import {
  createEmptyGroup,
  createEmptyOption,
  addGroup,
  removeGroup,
  updateGroup,
  addOption,
  removeOption,
  updateOption,
  moveOption,
  setGroupRequired,
  setGroupMultiple,
  groupSelectionMode,
  createAddonGroup,
  addAddonGroup,
  DEFAULT_ADDON_GROUP_NAME,
} from "./modifier-editor";
import type { ModifierGroup } from "./modifier-groups";

function baseGroup(): ModifierGroup {
  return {
    id: "g1",
    name: "Size",
    display_order: 0,
    min_select: 1,
    max_select: 1,
    options: [
      { id: "o1", name: "Small", price_modifier: 0, display_order: 0 },
      { id: "o2", name: "Large", price_modifier: 20, display_order: 1 },
    ],
  };
}

describe("createEmptyGroup / createEmptyOption", () => {
  it("creates a group with a unique id and one empty option", () => {
    const g = createEmptyGroup();
    expect(g.id).toBeTruthy();
    expect(g.name).toBe("");
    expect(g.options).toHaveLength(1);
    expect(createEmptyGroup().id).not.toBe(g.id);
  });

  it("creates an option with a unique id and a zero price modifier", () => {
    const o = createEmptyOption();
    expect(o.id).toBeTruthy();
    expect(o.price_modifier).toBe(0);
    expect(createEmptyOption().id).not.toBe(o.id);
  });
});

describe("addGroup / removeGroup", () => {
  it("appends a new group without mutating the input", () => {
    const groups: ModifierGroup[] = [baseGroup()];
    const next = addGroup(groups);
    expect(next).toHaveLength(2);
    expect(groups).toHaveLength(1);
  });

  it("removes the targeted group only", () => {
    const groups: ModifierGroup[] = [baseGroup(), { ...baseGroup(), id: "g2" }];
    const next = removeGroup(groups, "g1");
    expect(next.map((g) => g.id)).toEqual(["g2"]);
    expect(groups).toHaveLength(2);
  });
});

/**
 * Merchants look for "add-ons", not "a multi-select option group". The add-on
 * factory pre-applies the add-on selection rules so the affordance is one tap.
 */
describe("createAddonGroup / addAddonGroup", () => {
  it("creates an optional, unlimited multi-select group", () => {
    const group = createAddonGroup();

    expect(group.min_select).toBe(0);
    expect(group.max_select).toBeNull();
    expect(groupSelectionMode(group)).toBe("multi");
  });

  it("pre-fills a recognisable group name and one blank option", () => {
    const group = createAddonGroup();

    expect(group.name).toBe(DEFAULT_ADDON_GROUP_NAME);
    expect(group.options).toHaveLength(1);
    expect(group.options[0].name).toBe("");
  });

  it("gives each add-on group a unique id", () => {
    expect(createAddonGroup().id).not.toBe(createAddonGroup().id);
  });

  it("appends the add-on group without mutating the input", () => {
    const groups: ModifierGroup[] = [baseGroup()];

    const next = addAddonGroup(groups);

    expect(next).toHaveLength(2);
    expect(next[1].max_select).toBeNull();
    expect(groups).toHaveLength(1);
  });

  it("still yields a single-select group from the plain group factory", () => {
    expect(groupSelectionMode(createEmptyGroup())).toBe("single");
  });
});

describe("updateGroup", () => {
  it("patches a field on the targeted group immutably", () => {
    const groups = [baseGroup()];
    const next = updateGroup(groups, "g1", { name: "Portion" });
    expect(next[0].name).toBe("Portion");
    expect(groups[0].name).toBe("Size");
  });

  it("leaves other groups untouched", () => {
    const groups: ModifierGroup[] = [baseGroup(), { ...baseGroup(), id: "g2", name: "Add-ons" }];
    const next = updateGroup(groups, "g1", { name: "Portion" });
    expect(next[1].name).toBe("Add-ons");
  });
});

describe("addOption / removeOption / updateOption", () => {
  it("adds an empty option to the targeted group", () => {
    const groups = [baseGroup()];
    const next = addOption(groups, "g1");
    expect(next[0].options).toHaveLength(3);
    expect(groups[0].options).toHaveLength(2);
  });

  it("removes the targeted option", () => {
    const groups = [baseGroup()];
    const next = removeOption(groups, "g1", "o1");
    expect(next[0].options.map((o) => o.id)).toEqual(["o2"]);
  });

  it("patches an option field immutably", () => {
    const groups = [baseGroup()];
    const next = updateOption(groups, "g1", "o2", { price_modifier: 35 });
    expect(next[0].options[1].price_modifier).toBe(35);
    expect(groups[0].options[1].price_modifier).toBe(20);
  });
});

describe("moveOption", () => {
  it("reorders options within a group", () => {
    const groups = [baseGroup()];
    const next = moveOption(groups, "g1", 0, 1);
    expect(next[0].options.map((o) => o.id)).toEqual(["o2", "o1"]);
  });

  it("is a no-op for out-of-range indexes", () => {
    const groups = [baseGroup()];
    const next = moveOption(groups, "g1", 0, 9);
    expect(next[0].options.map((o) => o.id)).toEqual(["o1", "o2"]);
  });
});

describe("selection-rule helpers", () => {
  it("setGroupRequired(true) forces min_select to at least 1", () => {
    const groups = [{ ...baseGroup(), min_select: 0 }];
    const next = setGroupRequired(groups, "g1", true);
    expect(next[0].min_select).toBe(1);
  });

  it("setGroupRequired(false) sets min_select to 0", () => {
    const groups = [baseGroup()];
    const next = setGroupRequired(groups, "g1", false);
    expect(next[0].min_select).toBe(0);
  });

  it("setGroupMultiple(true) makes the group unlimited (max_select null)", () => {
    const groups = [baseGroup()];
    const next = setGroupMultiple(groups, "g1", true);
    expect(next[0].max_select).toBeNull();
  });

  it("setGroupMultiple(false) makes the group single-select (max_select 1)", () => {
    const groups = [{ ...baseGroup(), max_select: null }];
    const next = setGroupMultiple(groups, "g1", false);
    expect(next[0].max_select).toBe(1);
  });

  it("groupSelectionMode reports single vs multi", () => {
    expect(groupSelectionMode(baseGroup())).toBe("single");
    expect(groupSelectionMode({ ...baseGroup(), max_select: null })).toBe("multi");
    expect(groupSelectionMode({ ...baseGroup(), max_select: 3 })).toBe("multi");
  });
});
