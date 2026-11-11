/**
 * Which lenses the Shift sales screen offers and which report each reads.
 * Owner decision 2026-11-04: a cashier sees her own sales, never the store's —
 * so a plain cashier gets "My sales" and "My drawer" only, and every read she
 * makes asks the server for the cashier scope.
 */
import { initialLens, lensOptions, reportScopeFor, canSeeStoreSales } from "./shift-sales-lens";

const cashier = { role: "admin", isOwner: false, permissions: ["pos"] };
const manager = { role: "admin", isOwner: false, permissions: ["pos", "cash_manage"] };
const reporter = { role: "admin", isOwner: false, permissions: ["pos", "reports"] };
const owner = { role: "admin", isOwner: true, permissions: [] };

describe("canSeeStoreSales", () => {
  it("is cash managers, Reports holders and owners — never a plain cashier", () => {
    expect([cashier, manager, reporter, owner].map(canSeeStoreSales)).toEqual([false, true, true, true]);
  });
});

describe("lensOptions", () => {
  it("a plain cashier: My sales and My drawer, no Store sales", () => {
    expect(lensOptions({ canSeeStore: false, isMine: true }).map((o) => o.label)).toEqual(["My sales", "My drawer"]);
  });

  it("a manager keeps Store sales and My drawer, plus the cashier's own sales", () => {
    expect(lensOptions({ canSeeStore: true, isMine: true }).map((o) => o.label)).toEqual(["My sales", "Store sales", "My drawer"]);
    expect(lensOptions({ canSeeStore: true, isMine: false }).map((o) => o.label)).toEqual(["Cashier's sales", "Store sales", "My drawer"]);
  });
});

describe("initialLens", () => {
  it("opens on My sales for a plain cashier whatever the link says", () => {
    expect(initialLens({ param: undefined, canSeeStore: false })).toBe("mine");
    expect(initialLens({ param: "store", canSeeStore: false })).toBe("mine");
  });

  it("opens on My sales when the link asks (End shift, My shifts, the Drawer), else on the store for a manager", () => {
    expect(initialLens({ param: "mine", canSeeStore: true })).toBe("mine");
    expect(initialLens({ param: undefined, canSeeStore: true })).toBe("store");
  });
});

describe("reportScopeFor", () => {
  it("never asks a plain cashier's server read for the store window", () => {
    expect(reportScopeFor("mine", false)).toBe("cashier");
    expect(reportScopeFor("drawer", false)).toBe("cashier");
    expect(reportScopeFor("store", false)).toBe("cashier");
  });

  it("a manager's store and drawer lenses read the window as before", () => {
    expect(reportScopeFor("store", true)).toBe("window");
    expect(reportScopeFor("drawer", true)).toBe("window");
    expect(reportScopeFor("mine", true)).toBe("cashier");
  });
});
