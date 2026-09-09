/**
 * The Insights bar was seven items wide and every label truncated. Three of its
 * screens were demoted to sub-screens; these tests hold the two halves of that
 * change together — the bar really is shorter, and nothing fell off the map.
 */
import { subscreensOf, parentOf, isSubscreen, SUBSCREEN_PARENTS } from "./subscreen-links";
import {
  isTabOnBar,
  isTabReachable,
  SUBSCREEN_TABS,
  OFF_BAR_TABS,
  type TabVisibilityContext,
} from "./tab-visibility";
import { getWorkspace, workspaceForTab } from "./workspaces";

const owner: TabVisibilityContext = {
  caller: { role: "admin", isOwner: true, permissions: null },
  audience: { accountScope: { kind: "all" }, activeOutletCount: 3, isDemo: false },
  takesAdvanceOrders: true,
};

describe("the Insights bar", () => {
  it("is three tabs wide, so no label has to truncate", () => {
    const onBar = getWorkspace("insights").tabs.filter((tab) =>
      isTabOnBar(tab, "insights", owner),
    );

    expect(onBar).toEqual(["analytics", "growth", "customer-hub"]);
  });

  it("keeps every demoted screen reachable", () => {
    // Off the bar is not gone: the Menu hub lists them, and the parent screens
    // link to them. A screen an owner cannot open from anywhere is deleted, not
    // demoted.
    for (const tab of SUBSCREEN_TABS) {
      expect(isTabReachable(tab, owner)).toBe(true);
      expect(isTabOnBar(tab, "insights", owner)).toBe(false);
    }
  });

  it("demoted only Insights screens", () => {
    for (const tab of SUBSCREEN_TABS) {
      expect(workspaceForTab(tab)).toBe("insights");
    }
  });
});

describe("SUBSCREEN_PARENTS", () => {
  it("gives every demoted screen exactly one door", () => {
    const linked = Object.values(SUBSCREEN_PARENTS).flatMap((tabs) => [...tabs]);

    expect([...linked].sort()).toEqual([...SUBSCREEN_TABS].sort());
    expect(new Set(linked).size).toBe(linked.length);
  });

  it("hangs each one under a screen that is itself on the bar", () => {
    // A door on a screen the merchant cannot get to is not a door.
    for (const parent of Object.keys(SUBSCREEN_PARENTS)) {
      expect(isTabOnBar(parent, "insights", owner)).toBe(true);
    }
  });

  it("never names a setup screen — those belong to the Menu hub", () => {
    const linked = Object.values(SUBSCREEN_PARENTS).flat();

    expect(linked).not.toContain("payments");
    expect(OFF_BAR_TABS).toContain("payments");
  });
});

describe("subscreensOf", () => {
  it("offers Trends under Analytics", () => {
    expect(subscreensOf("analytics", owner.caller).map((l) => l.tab)).toEqual(["trends"]);
  });

  it("offers the guest list and Rewards under the Customers overview", () => {
    expect(subscreensOf("customer-hub", owner.caller).map((l) => l.tab)).toEqual([
      "customers",
      "loyalty",
    ]);
  });

  it("carries the label and hint the tab bar and Menu hub already use", () => {
    const [trends] = subscreensOf("analytics", owner.caller);

    expect(trends.label).toBe("Trends");
    expect(trends.hint.length).toBeGreaterThan(0);
    expect(trends.href).toBe("/(main)/trends");
  });

  it("drops a screen the account may not open", () => {
    // Analytics staff may read the numbers but not the guest list; offering a
    // row that refuses them is worse than not offering it.
    const analyticsStaff = { role: "admin", isOwner: false, permissions: ["analytics"] };

    expect(subscreensOf("analytics", analyticsStaff).map((l) => l.tab)).toEqual(["trends"]);
    expect(subscreensOf("customer-hub", analyticsStaff)).toEqual([]);
  });

  it("returns nothing for a screen that has no sub-screens", () => {
    expect(subscreensOf("growth", owner.caller)).toEqual([]);
  });

  it("applies no gate beyond staff grants, which is all these screens carry", () => {
    // subscreensOf takes only the caller. That is safe exactly while no
    // sub-screen is also gated on branch count or on pre-orders; if one ever
    // is, this fails and the filter has to grow the full context.
    const single = { ...owner, audience: { ...owner.audience, activeOutletCount: 1 } };

    for (const tab of SUBSCREEN_TABS) {
      expect(isTabReachable(tab, single)).toBe(true);
      expect(isTabReachable(tab, { ...owner, takesAdvanceOrders: false })).toBe(true);
    }
  });
});

describe("parentOf / isSubscreen", () => {
  it("maps a demoted screen back to the screen it hangs under", () => {
    expect(parentOf("trends")).toBe("analytics");
    expect(parentOf("customers")).toBe("customer-hub");
    expect(parentOf("loyalty")).toBe("customer-hub");
  });

  it("leaves a bar tab parentless", () => {
    expect(parentOf("analytics")).toBeUndefined();
    expect(isSubscreen("analytics")).toBe(false);
    expect(isSubscreen("trends")).toBe(true);
  });
});
