import { REPORTS_SECTIONS, MANAGE_SECTIONS, hubSections, hubTabs, HUB_CONTENTS } from "./hubs";
import { REPORT_TABS, SETUP_TABS, type TabVisibilityContext } from "./tab-visibility";

const owner: TabVisibilityContext = {
  caller: { role: "admin", isOwner: true, permissions: null },
  audience: { accountScope: { kind: "all" }, activeOutletCount: 3, isDemo: false },
  takesAdvanceOrders: true,
};

describe("hub registries", () => {
  it("list exactly the report and setup screens, each once", () => {
    // The hub is the only door to these screens, so the flat list of what the
    // hub draws must be the list the bar rule keeps off the bar — no more, no
    // fewer — or a screen is either unreachable or in two places.
    expect([...hubTabs(REPORTS_SECTIONS)].sort()).toEqual([...HUB_CONTENTS.reports].sort());
    expect([...hubTabs(MANAGE_SECTIONS)].sort()).toEqual([...HUB_CONTENTS.manage].sort());
    expect(HUB_CONTENTS.reports).toBe(REPORT_TABS);
    expect(HUB_CONTENTS.manage).toBe(SETUP_TABS);
  });

  it("never list the same screen in both hubs", () => {
    const both = [...hubTabs(REPORTS_SECTIONS), ...hubTabs(MANAGE_SECTIONS)];
    expect(new Set(both).size).toBe(both.length);
  });

  it("give every section a heading and at least one screen", () => {
    for (const section of [...REPORTS_SECTIONS, ...MANAGE_SECTIONS]) {
      expect(section.title.length).toBeGreaterThan(0);
      expect(section.tabs.length).toBeGreaterThan(0);
    }
  });
});

describe("hubSections", () => {
  it("shows an owner every section", () => {
    expect(hubSections(REPORTS_SECTIONS, owner).map((s) => s.title)).toEqual(
      REPORTS_SECTIONS.map((s) => s.title),
    );
    expect(hubSections(MANAGE_SECTIONS, owner).map((s) => s.title)).toEqual(
      MANAGE_SECTIONS.map((s) => s.title),
    );
  });

  it("drops the Branches sections for a single-branch store", () => {
    // Both branch screens are gated on the branch count; the section must
    // vanish with them rather than sit there as an empty heading.
    const single = { ...owner, audience: { ...owner.audience, activeOutletCount: 1 } };
    expect(hubSections(REPORTS_SECTIONS, single).map((s) => s.title)).not.toContain("Branches");
    expect(hubSections(MANAGE_SECTIONS, single).map((s) => s.title)).not.toContain("Branches");
  });

  it("drops rows a staffer may not open and keeps the rest of the section", () => {
    // May reorder the flour, may not read where the money lands.
    const menuStaff = { ...owner, caller: { role: "admin", isOwner: false, permissions: ["menu"] } };
    const store = hubSections(MANAGE_SECTIONS, menuStaff).find((s) => s.title === "Store");
    expect(store?.tabs).toEqual(["product-management", "categories", "inventory"]);
  });

  it("returns nothing for an account that may open no report", () => {
    const cashier = { ...owner, caller: { role: "admin", isOwner: false, permissions: ["pos"] } };
    expect(hubSections(REPORTS_SECTIONS, cashier)).toEqual([]);
  });
});
