// The Team screen's display registries: a label for every permission an owner
// can grant, and a label for every screen they can pin a staff account to.
// Coverage is the point — a permission key added to the registry but missing
// here would render as a blank toggle on the phone.

import { STAFF_PERMISSION_KEYS } from "./staff-permissions";
import { WORKSPACES } from "./workspaces";
import {
  PERMISSION_OPTIONS,
  PINNABLE_SCREENS,
  containingGrantLabel,
  describePermissions,
} from "./team-roster";

describe("PERMISSION_OPTIONS", () => {
  it("labels every permission key, in registry order", () => {
    expect(PERMISSION_OPTIONS.map((o) => o.key)).toEqual([...STAFF_PERMISSION_KEYS]);
    for (const option of PERMISSION_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
      expect(option.description.length).toBeGreaterThan(0);
    }
  });
});

describe("PINNABLE_SCREENS", () => {
  it("labels every workspace tab exactly once", () => {
    const allTabs = WORKSPACES.flatMap((w) => [...w.tabs]);
    expect(PINNABLE_SCREENS.map((s) => s.tab)).toEqual(allTabs);
    for (const screen of PINNABLE_SCREENS) {
      expect(screen.label.length).toBeGreaterThan(0);
    }
  });
});

describe("containingGrantLabel", () => {
  it("names the grant that already includes a carved-out screen", () => {
    expect(containingGrantLabel("kitchen")).toBe("Orders");
    expect(containingGrantLabel("tables")).toBe("Orders");
  });

  it("is null for a grant that stands on its own", () => {
    expect(containingGrantLabel("pos")).toBeNull();
    expect(containingGrantLabel("loyalty_manage")).toBeNull();
  });
});

describe("describePermissions", () => {
  it("summarises full access, a few grants, and many grants", () => {
    expect(describePermissions(null)).toBe("Full access");
    expect(describePermissions(["orders", "pos"])).toBe("Orders, POS");
    expect(
      describePermissions(["orders", "pos", "menu", "analytics", "customers"])
    ).toBe("Orders, POS, Menu +2 more");
  });

  it("ignores keys it does not know rather than rendering blanks", () => {
    expect(describePermissions(["orders", "mystery"])).toBe("Orders");
  });
});
