import { readFileSync } from "fs";
import { join } from "path";

import { SUPERADMIN_LANDING_HREF } from "./session-resolve";
import {
  SUPERADMIN_TABS,
  SUPERADMIN_TAB_NAMES,
  getSuperadminTab,
  isSuperadminTab,
  superadminTabHref,
} from "./superadmin-nav";

const SUPERADMIN_DIR = join(__dirname, "..", "app", "(superadmin)");

function readSuperadminFile(name: string): string {
  return readFileSync(join(SUPERADMIN_DIR, name), "utf8");
}

describe("SUPERADMIN_TABS registry", () => {
  it("defines the platform tabs", () => {
    expect(SUPERADMIN_TAB_NAMES).toEqual(["dashboard", "tenants", "settings"]);
  });

  it("keeps the name list in step with the registry", () => {
    expect(SUPERADMIN_TABS.map((t) => t.name)).toEqual([
      ...SUPERADMIN_TAB_NAMES,
    ]);
  });

  it("never repeats a tab name", () => {
    const names = SUPERADMIN_TABS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every tab a label and an icon", () => {
    for (const tab of SUPERADMIN_TABS) {
      expect(tab.label.length).toBeGreaterThan(0);
      expect(tab.icon.length).toBeGreaterThan(0);
    }
  });
});

describe("superadminTabHref", () => {
  it("builds a fully-substituted href", () => {
    expect(superadminTabHref("tenants")).toBe("/(superadmin)/tenants");
  });

  it("agrees with the post-sign-in landing route", () => {
    // Cross-module invariant: resolveSession sends a superadmin to this href,
    // so it must name a tab that actually exists in the registry.
    expect(SUPERADMIN_LANDING_HREF).toBe(superadminTabHref("tenants"));
  });
});

describe("isSuperadminTab", () => {
  it("recognizes a registered tab", () => {
    expect(isSuperadminTab("tenants")).toBe(true);
  });

  it("rejects a merchant tab", () => {
    expect(isSuperadminTab("pos")).toBe(false);
  });
});

describe("getSuperadminTab", () => {
  it("returns the tab for a known name", () => {
    expect(getSuperadminTab("dashboard")?.label).toBe("Overview");
  });

  it("returns undefined for an unknown name", () => {
    expect(getSuperadminTab("bogus")).toBeUndefined();
  });
});

describe("superadmin screens", () => {
  it.each(SUPERADMIN_TAB_NAMES)("ships a screen file for %s", (name) => {
    expect(() => readSuperadminFile(`${name}.tsx`)).not.toThrow();
  });

  it.each(SUPERADMIN_TAB_NAMES)(
    "declares %s in the superadmin layout",
    (name) => {
      expect(readSuperadminFile("_layout.tsx")).toContain(`name="${name}"`);
    }
  );
});

describe("superadmin surface is role-gated", () => {
  // App Store guardrail: this binary was rejected twice over account flows.
  // The platform surface must be unreachable for merchants, demo sessions and
  // App Review, and must never be advertised to them.
  it("redirects a non-superadmin out of the layout", () => {
    const layout = readSuperadminFile("_layout.tsx");

    expect(layout).toContain("isSuperadmin");
    expect(layout).toMatch(/router\.replace/);
  });

  it("keeps the platform surface out of the merchant tab bar", () => {
    // Route names may repeat across groups (both trees own a "dashboard"), so
    // the invariant is that no merchant tab links into the (superadmin) group.
    const mainLayout = readFileSync(
      join(__dirname, "..", "app", "(main)", "_layout.tsx"),
      "utf8"
    );
    const tabsBlock = mainLayout.slice(mainLayout.indexOf("<Tabs"));

    expect(tabsBlock).not.toContain("(superadmin)");
  });

  it("never routes the demo session into the platform surface", () => {
    const login = readFileSync(
      join(__dirname, "..", "app", "(auth)", "login.tsx"),
      "utf8"
    );
    const demoBlock = login.slice(
      login.indexOf("handleExploreDemo"),
      login.indexOf("handleLogin")
    );

    expect(demoBlock).not.toContain("(superadmin)");
  });
});
