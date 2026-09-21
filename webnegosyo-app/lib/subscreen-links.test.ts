/**
 * Six screens hang under a bar tab instead of taking a slot. These tests hold
 * the two halves of that together — the bar really is five slots, and nothing
 * fell off the map: every demoted screen has exactly one door, on a screen the
 * merchant can actually stand on.
 */
import { subscreensOf, parentOf, isSubscreen, SUBSCREEN_PARENTS } from "./subscreen-links";
import {
  isTabOnBar,
  isTabReachable,
  SUBSCREEN_TABS,
  REPORT_TABS,
  SETUP_TABS,
  type TabVisibilityContext,
} from "./tab-visibility";

const owner: TabVisibilityContext = {
  caller: { role: "admin", isOwner: true, permissions: null },
  audience: { accountScope: { kind: "all" }, activeOutletCount: 3, isDemo: false },
  takesAdvanceOrders: true,
};

describe("SUBSCREEN_PARENTS", () => {
  it("gives every demoted screen exactly one door", () => {
    const linked = Object.values(SUBSCREEN_PARENTS).flatMap((tabs) => [...tabs]);

    expect([...linked].sort()).toEqual([...SUBSCREEN_TABS].sort());
    expect(new Set(linked).size).toBe(linked.length);
  });

  it("hangs each one under a screen that is itself on the bar or in a hub", () => {
    // A door on a screen the merchant cannot get to is not a door.
    for (const parent of Object.keys(SUBSCREEN_PARENTS)) {
      expect(isTabOnBar(parent, owner) || isTabReachable(parent, owner)).toBe(true);
      expect(isSubscreen(parent)).toBe(false);
    }
  });

  it("keeps every demoted screen reachable but off the bar", () => {
    for (const tab of SUBSCREEN_TABS) {
      expect(isTabReachable(tab, owner)).toBe(true);
      if (tab !== "kitchen") expect(isTabOnBar(tab, owner)).toBe(false);
    }
  });

  it("never names a report or a setup screen — those belong to the hubs", () => {
    const linked = Object.values(SUBSCREEN_PARENTS).flat();
    for (const tab of [...REPORT_TABS, ...SETUP_TABS]) {
      expect(linked).not.toContain(tab);
    }
  });
});

describe("subscreensOf", () => {
  it("offers Kitchen, Tables and Schedule under Orders", () => {
    expect(subscreensOf("orders", owner).map((l) => l.tab)).toEqual([
      "kitchen",
      "tables",
      "scheduled",
    ]);
  });

  it("offers the Drawer under POS", () => {
    expect(subscreensOf("pos", owner).map((l) => l.tab)).toEqual(["pos-sales"]);
  });

  it("offers Trends under Analytics", () => {
    expect(subscreensOf("analytics", owner).map((l) => l.tab)).toEqual(["trends"]);
  });

  it("offers the guest list and Rewards under the Customers overview", () => {
    expect(subscreensOf("customer-hub", owner).map((l) => l.tab)).toEqual([
      "customers",
      "loyalty",
    ]);
  });

  it("carries the label and hint the bar and hubs already use", () => {
    const [trends] = subscreensOf("analytics", owner);

    expect(trends.label).toBe("Trends");
    expect(trends.hint.length).toBeGreaterThan(0);
    expect(trends.href).toBe("/(main)/trends");
  });

  it("drops a screen the account may not open", () => {
    // Analytics staff may read the numbers but not the guest list; offering a
    // row that refuses them is worse than not offering it.
    const analyticsStaff = {
      ...owner,
      caller: { role: "admin", isOwner: false, permissions: ["analytics"] },
    };

    expect(subscreensOf("analytics", analyticsStaff).map((l) => l.tab)).toEqual(["trends"]);
    expect(subscreensOf("customer-hub", analyticsStaff)).toEqual([]);
  });

  it("drops the Schedule door from a store that never takes pre-orders", () => {
    // The bar hides Schedule for such a store; the door on Orders must agree.
    expect(subscreensOf("orders", { ...owner, takesAdvanceOrders: false }).map((l) => l.tab)).toEqual([
      "kitchen",
      "tables",
    ]);
  });

  it("drops the Kitchen and Tables doors from a staffer holding neither the screens nor the queue", () => {
    const posOnly = {
      ...owner,
      caller: { role: "admin", isOwner: false, permissions: ["pos"] },
    };
    expect(subscreensOf("orders", posOnly).map((l) => l.tab)).toEqual([]);
  });

  it("opens both doors for a staffer holding the order queue they are slices of", () => {
    const ordersOnly = {
      ...owner,
      caller: { role: "admin", isOwner: false, permissions: ["orders"] },
    };
    expect(subscreensOf("orders", ordersOnly).map((l) => l.tab)).toEqual([
      "kitchen",
      "tables",
      "scheduled",
    ]);
  });

  it("returns nothing for a screen that has no sub-screens", () => {
    expect(subscreensOf("growth", owner)).toEqual([]);
  });
});

describe("parentOf / isSubscreen", () => {
  it("maps a demoted screen back to the screen it hangs under", () => {
    expect(parentOf("kitchen")).toBe("orders");
    expect(parentOf("pos-sales")).toBe("pos");
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
