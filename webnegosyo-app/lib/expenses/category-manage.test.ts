import {
  archivedCategories,
  canChangeGroup,
  categorySections,
  draftForEdit,
  draftForNew,
  draftProblem,
  isUnchanged,
  lockHint,
  moveWrites,
  moveability,
  nextSortOrder,
  withCategory,
} from "./category-manage";
import { EXPENSE_GROUPS, type ExpenseCategory } from "./types";

function category(overrides: Partial<ExpenseCategory> & { id: string }): ExpenseCategory {
  return {
    tenantId: "t1",
    systemKey: null,
    name: overrides.id,
    icon: null,
    group: "operating",
    needsNote: false,
    sortOrder: 0,
    archivedAt: null,
    ...overrides,
  };
}

const ICE = category({ id: "ice", name: "Ice (Yelo)", group: "ingredients", systemKey: "ice", sortOrder: 10 });
const GAS = category({ id: "gas", name: "Gas", group: "ingredients", sortOrder: 20 });
const OLD = category({ id: "old", name: "Charcoal", group: "ingredients", sortOrder: 30, archivedAt: "2026-11-01T00:00:00Z" });
const RENT = category({ id: "rent", name: "Rent (Upa)", group: "occupancy", systemKey: "rent", sortOrder: 80 });
const ALL = [ICE, GAS, OLD, RENT];

describe("drafts", () => {
  it("starts a new category at the end of its group, past archived ones too", () => {
    expect(draftForNew(ALL, "ingredients")).toEqual({ name: "", group: "ingredients", needsNote: false, sortOrder: 40, isStarter: false });
  });

  it("starts the first category of an empty group at 0", () => {
    expect(nextSortOrder(ALL, "capex")).toBe(0);
  });

  it("marks seeded categories as starters, whose group stays", () => {
    const draft = draftForEdit(ICE);
    expect(draft.isStarter).toBe(true);
    expect(canChangeGroup(draft)).toBe(false);
    expect(lockHint(draft)).toMatch(/Starter categories keep their group/);
  });

  it("lets an owner's own category change group, with the used-category warning", () => {
    const draft = draftForEdit(GAS);
    expect(canChangeGroup(draft)).toBe(true);
    expect(lockHint(draft)).toMatch(/Once a category has expenses/);
  });

  it("shows no lock for a new category", () => {
    expect(lockHint(draftForNew(ALL, "staff"))).toBeNull();
  });
});

describe("draftProblem", () => {
  it("needs a name", () => {
    expect(draftProblem({ ...draftForNew(ALL, "staff"), name: "   " }, ALL)).toBe("Name the category.");
  });

  it("refuses a name longer than the database allows", () => {
    expect(draftProblem({ ...draftForNew(ALL, "staff"), name: "x".repeat(61) }, ALL)).toMatch(/under 61/);
  });

  it("refuses a live name already taken, whatever the case and spaces", () => {
    expect(draftProblem({ ...draftForNew(ALL, "staff"), name: "  gas " }, ALL)).toBe("There is already a category with that name.");
  });

  it("allows an archived category's name, and a category keeping its own name", () => {
    expect(draftProblem({ ...draftForNew(ALL, "staff"), name: "Charcoal" }, ALL)).toBeNull();
    expect(draftProblem(draftForEdit(GAS), ALL)).toBeNull();
  });
});

describe("isUnchanged", () => {
  it("is true only when name, group and note rule are all the same", () => {
    expect(isUnchanged(draftForEdit(GAS), ALL)).toBe(true);
    expect(isUnchanged({ ...draftForEdit(GAS), name: "Gas " }, ALL)).toBe(true);
    expect(isUnchanged({ ...draftForEdit(GAS), name: "LPG" }, ALL)).toBe(false);
    expect(isUnchanged({ ...draftForEdit(GAS), needsNote: true }, ALL)).toBe(false);
    expect(isUnchanged(draftForNew(ALL, "staff"), ALL)).toBe(false);
  });
});

describe("sections", () => {
  it("lists every group in order, live categories only", () => {
    const sections = categorySections(ALL);
    expect(sections.map((section) => section.group)).toEqual([...EXPENSE_GROUPS]);
    expect(sections[0]).toMatchObject({ group: "ingredients", label: "Ingredients", hint: "Food and drink cost" });
    expect(sections[0].items.map((entry) => entry.id)).toEqual(["ice", "gas"]);
    expect(sections.find((section) => section.group === "capex")?.items).toEqual([]);
  });

  it("keeps archived ones apart", () => {
    expect(archivedCategories(ALL).map((entry) => entry.id)).toEqual(["old"]);
  });
});

describe("moveWrites", () => {
  it("swaps sort orders with the neighbour in the same group", () => {
    expect(moveWrites(ALL, "gas", -1)).toEqual([
      { category: GAS, sortOrder: 10 },
      { category: ICE, sortOrder: 20 },
    ]);
  });

  it("never moves past the edge of a group or onto an archived category", () => {
    expect(moveWrites(ALL, "ice", -1)).toBeNull();
    expect(moveWrites(ALL, "gas", 1)).toBeNull();
    expect(moveWrites(ALL, "rent", 1)).toBeNull();
    expect(moveability(ALL, "gas")).toEqual({ up: true, down: false });
  });

  it("refuses to move an archived category", () => {
    expect(moveWrites(ALL, "old", -1)).toBeNull();
  });

  it("separates two categories that share a sort order so the move shows", () => {
    const a = category({ id: "a", name: "Alpha", sortOrder: 10 });
    const b = category({ id: "b", name: "Bravo", sortOrder: 10 });
    const down = moveWrites([a, b], "a", 1);
    expect(down).toEqual([
      { category: a, sortOrder: 11 },
      { category: b, sortOrder: 10 },
    ]);
    const up = moveWrites([a, b], "b", -1);
    expect(up).toEqual([
      { category: b, sortOrder: 9 },
      { category: a, sortOrder: 10 },
    ]);
  });

  it("never writes a negative sort order", () => {
    const a = category({ id: "a", name: "Alpha", sortOrder: 0 });
    const b = category({ id: "b", name: "Bravo", sortOrder: 0 });
    expect(moveWrites([a, b], "b", -1)).toEqual([
      { category: b, sortOrder: 0 },
      { category: a, sortOrder: 1 },
    ]);
  });
});

describe("withCategory", () => {
  it("replaces by id, or adds a new one", () => {
    const renamed = { ...GAS, name: "LPG" };
    expect(withCategory(ALL, renamed).find((entry) => entry.id === "gas")?.name).toBe("LPG");
    expect(withCategory(ALL, category({ id: "new" }))).toHaveLength(5);
  });
});
