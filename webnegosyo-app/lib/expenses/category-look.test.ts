import { SEED_CATEGORIES } from "./categories";
import { categoryInitials, categoryLook, groupTone, shortCategoryName, SYSTEM_ICONS } from "./category-look";
import { EXPENSE_GROUPS } from "./types";

describe("categoryLook", () => {
  it("draws a real icon for every seeded category", () => {
    for (const seed of SEED_CATEGORIES) {
      expect(SYSTEM_ICONS[seed.systemKey]).toBeDefined();
    }
  });

  it("uses initials in the group colour for a category the owner made", () => {
    const look = categoryLook({ systemKey: null, name: "Kape supplier", group: "ingredients" });

    expect(look.mark).toEqual({ kind: "initials", text: "KS" });
    expect(look.tone).toBe(groupTone("ingredients"));
  });

  it("colours by group, so Palengke and Yelo match", () => {
    const palengke = categoryLook({ systemKey: "ingredients", name: "Ingredients (Palengke)", group: "ingredients" });
    const yelo = categoryLook({ systemKey: "ice", name: "Ice (Yelo)", group: "ingredients" });

    expect(palengke.tone).toBe(yelo.tone);
    expect(palengke.mark).toEqual({ kind: "icon", icon: "basket" });
  });

  it("falls back to a neutral mark when the category is unknown", () => {
    expect(categoryLook(null).mark).toEqual({ kind: "icon", icon: "dots" });
  });

  it("has a tone for every group", () => {
    for (const group of EXPENSE_GROUPS) {
      expect(groupTone(group).ink).toMatch(/^#/);
    }
  });
});

describe("categoryInitials", () => {
  it.each([
    ["Kape supplier", "KS"],
    ["Ukay", "UK"],
    ["13th month", "1M"],
    ["Rent (Upa)", "RE"],
    ["  ", "?"],
  ])("%s → %s", (name, expected) => {
    expect(categoryInitials(name)).toBe(expected);
  });
});

describe("shortCategoryName", () => {
  it.each([
    ["Ice (Yelo)", "Yelo"],
    ["Ingredients (Palengke)", "Palengke"],
    ["Cleaning & supplies", "Cleaning"],
    ["SSS / PhilHealth / Pag-IBIG", "SSS"],
    ["Owner took cash (Kinuha ng may-ari)", "Owner took cash"],
    ["Rent", "Rent"],
  ])("%s → %s", (name, expected) => {
    expect(shortCategoryName(name)).toBe(expected);
  });
});
