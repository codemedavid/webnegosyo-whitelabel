// Guardrails for the Tables tab (the floor plan). Like the other mount
// guardrails in this directory, Jest only runs pure-logic roots, so this
// asserts on the screen source rather than rendering it: the tab is registered
// everywhere a tab must be registered, it is gated on the new `tables`
// permission (an unmapped tab defaults to ALLOWED, which would put every
// party's bill in front of every staffer), it only exists for a store that
// seats guests, and the screen defers to the shared floor logic.
import { existsSync, readFileSync } from "fs";
import { join } from "path";

import { getWorkspace, workspaceForTab } from "./workspaces";
import { SUBSCREEN_TABS } from "./tab-visibility";
import { SUBSCREEN_PARENTS, parentOf } from "./subscreen-links";
import { isTabAllowed, STAFF_PERMISSION_KEYS } from "./staff-permissions";
import { tabPresentation } from "./workspace-presentation";

const ROOT = join(__dirname, "..");

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

const screen = () => read("app", "(main)", "tables.tsx");

describe("tables tab registration", () => {
  it("belongs to the Operations view, beside the queue and the pass", () => {
    expect(workspaceForTab("tables")).toBe("operations");
    const tabs = getWorkspace("operations").tabs;
    expect(tabs.indexOf("tables")).toBe(tabs.indexOf("kitchen") + 1);
  });

  it("has a route file, so registering it cannot break the tab bar", () => {
    expect(existsSync(join(ROOT, "app", "(main)", "tables.tsx"))).toBe(true);
  });

  it("is registered in the tab layout with the same visibility gate", () => {
    expect(read("app", "(main)", "_layout.tsx")).toMatch(
      /name="tables"[\s\S]{0,160}href: show\("tables"\)/,
    );
  });

  it("hangs under Orders rather than taking a slot on the fixed bar", () => {
    // The bar is five fixed slots (Home · Orders · POS · Reports · Manage).
    // The floor is the same live orders seen from the host stand, so it is
    // entered from Orders — and every sub-screen needs a door, or it is a
    // screen nobody can reach.
    expect(SUBSCREEN_TABS).toContain("tables");
    expect(parentOf("tables")).toBe("orders");
    expect(SUBSCREEN_PARENTS.orders).toContain("tables");
  });

  it("registers the table page off the bar, so Expo Router gives it no tab button", () => {
    expect(existsSync(join(ROOT, "app", "(main)", "table", "[tableId].tsx"))).toBe(true);
    expect(read("app", "(main)", "_layout.tsx")).toMatch(/name="table\/\[tableId\]"[\s\S]{0,80}href: null/);
  });

  it("has its own label, icon and hint rather than the fallback", () => {
    const presentation = tabPresentation("tables");
    expect(presentation.label).toBe("Tables");
    expect(presentation.icon).toBe("tables");
    expect(presentation.hint).not.toBe("");
  });

  it("draws its tab icon from the SVG set", () => {
    expect(read("components", "Icon.tsx")).toMatch(/\|\s*"tables"/);
    expect(read("components", "Icon.tsx")).toMatch(/\n\s+tables: \(/);
  });
});

describe("tables dine-in gate", () => {
  it("is answered in tab-visibility, never inline in the layout", () => {
    expect(read("lib", "tab-visibility.ts")).toMatch(/DINE_IN_TABS/);
    expect(read("lib", "tab-visibility.ts")).toMatch(/takesDineIn/);
    const layout = read("app", "(main)", "_layout.tsx");
    expect(layout).not.toMatch(/takesDineIn\s*&&/);
    expect(layout).not.toMatch(/takesDineIn\s*\?/);
  });

  it("is asked once, where every surface reads its gates from", () => {
    // The bar, both hubs, the sub-screen doors and Home's quick actions all
    // read one context; asking dine-in anywhere else lets them disagree.
    expect(read("lib", "use-tab-visibility-context.ts")).toMatch(/useDineIn\(\)/);
    expect(read("lib", "tutorial", "use-tutorial.ts")).toMatch(/useDineIn\(\)/);
  });
});

describe("tables permission", () => {
  it("exists in the app registry, after kitchen", () => {
    const keys = [...STAFF_PERMISSION_KEYS];
    expect(keys.indexOf("tables")).toBe(keys.indexOf("kitchen") + 1);
  });

  it("keeps staff without the grant off the floor", () => {
    const cashier = { role: "admin", isOwner: false, permissions: ["pos", "orders"] };
    expect(isTabAllowed(cashier, "tables")).toBe(false);
  });

  it("lets floor staff in", () => {
    const host = { role: "admin", isOwner: false, permissions: ["tables"] };
    expect(isTabAllowed(host, "tables")).toBe(true);
  });

  it("stays open to owners and legacy full-access accounts", () => {
    expect(isTabAllowed({ role: "admin", isOwner: true, permissions: [] }, "tables")).toBe(true);
    expect(isTabAllowed({ role: "admin", isOwner: false, permissions: null }, "tables")).toBe(true);
  });
});

describe("tables screen", () => {
  it("draws with the shared header, and never the retired view switcher", () => {
    expect(screen()).toMatch(/ScreenHeader/);
    expect(screen()).not.toMatch(/WorkspaceSwitcher|showSwitcher/);
  });

  it("derives every table's state from the shared floor logic, not a second opinion", () => {
    expect(screen()).toMatch(/buildTableViews/);
    expect(screen()).toMatch(/summarizeFloor/);
    expect(screen()).toMatch(/canClearTable/);
  });

  it("reads orders through the backend-routed hook and the floor through the cached hook", () => {
    expect(screen()).toMatch(/useSafeQuery/);
    expect(screen()).toMatch(/orders:getOrders/);
    expect(screen()).toMatch(/useDiningTables\(\)/);
    expect(screen()).toMatch(/useTableWrites\(\)/);
  });

  it("scopes the floor to the branch in view", () => {
    expect(screen()).toMatch(/useBranchScope/);
    expect(screen()).toMatch(/filterOrdersToScope/);
  });

  it("resets its per-visit state on focus — a tab mounts once per launch", () => {
    expect(screen()).toMatch(/useFocusEffect/);
  });

  it("keeps that reset out of the render loop", () => {
    // The reset closes any open sheet. Keyed on anything that changes per
    // render — `useTableWrites()` returns a fresh object, so a callback that
    // depends on it does too — it runs on EVERY render, and every sheet on
    // the floor shuts the instant it is opened.
    const flush = screen().match(/const flushMoves = useCallback\([\s\S]*?\n {2}\}, \[([^\]]*)\]\);/);
    expect(flush).not.toBeNull();
    expect((flush as RegExpMatchArray)[1].trim()).toBe("");

    const focus = screen().match(/useFocusEffect\(\s*useCallback\([\s\S]*?\n {4}\}, \[([^\]]*)\]\),\s*\);/);
    expect(focus).not.toBeNull();
    expect((focus as RegExpMatchArray)[1].trim()).toBe("flushMoves");
  });

  it("keeps the display awake through a service, like the kitchen board", () => {
    expect(screen()).toMatch(/useKeepAwake/);
  });

  it("blocks the demo session from changing a real store's floor", () => {
    expect(screen()).toMatch(/isDemo/);
  });
});
