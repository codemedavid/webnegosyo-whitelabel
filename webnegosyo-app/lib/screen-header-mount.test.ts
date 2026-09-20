// Guardrail: every tab screen draws its header with the shared ScreenHeader,
// and every pushed detail screen with BackHeader. Before these existed each
// screen hand-rolled its own title row with a hard-coded 60pt top gap, so the
// app read as seventeen unrelated screens and the notch inset was a guess.
// Jest only runs pure-logic roots, so this asserts on screen sources.
import { existsSync, readFileSync } from "fs";
import { join } from "path";

import { WORKSPACES } from "./workspaces";
import { BAR_SLOTS, HUB_TABS } from "./tab-visibility";

const SCREENS_DIR = join(__dirname, "..", "app", "(main)");

function read(...segments: string[]): string {
  return readFileSync(join(SCREENS_DIR, ...segments), "utf8");
}

const TAB_SCREENS = [...WORKSPACES.flatMap((w) => [...w.tabs]), ...HUB_TABS];

const DETAIL_SCREENS: string[][] = [
  ["account.tsx"],
  ["printer-settings.tsx"],
  ["team.tsx"],
  ["order", "[orderId].tsx"],
];

describe("tab screens", () => {
  it.each(HUB_TABS)("includes the %s hub as a route", (hub) => {
    expect(existsSync(join(SCREENS_DIR, `${hub}.tsx`))).toBe(true);
  });

  it.each(TAB_SCREENS)("draws %s with the shared ScreenHeader", (tab) => {
    const source = read(`${tab}.tsx`);
    expect(source).toMatch(/import \{ ScreenHeader \} from "\.\.\/\.\.\/components\/ScreenHeader";/);
    expect(source).toMatch(/<ScreenHeader/);
  });

  it.each(TAB_SCREENS)("no longer hard-codes a notch gap in %s", (tab) => {
    // The header reads the safe-area inset; a fixed top padding on top of it
    // is the double gap this migration removed.
    expect(read(`${tab}.tsx`)).not.toMatch(/paddingTop:\s*(56|60)\b/);
  });

  it.each(TAB_SCREENS)("never mounts the retired view switcher in %s", (tab) => {
    // The bar is fixed now; a chip that switches "views" would be a second,
    // contradictory navigation.
    expect(read(`${tab}.tsx`)).not.toMatch(/WorkspaceSwitcher|showSwitcher/);
  });
});

describe("the shared header", () => {
  it("draws no view chip", () => {
    const source = readFileSync(join(__dirname, "..", "components", "ScreenHeader.tsx"), "utf8");
    expect(source).not.toMatch(/WorkspaceSwitcher|showSwitcher|leading/);
  });
});

describe("detail screens", () => {
  it.each(DETAIL_SCREENS)("draws %s with BackHeader", (...segments) => {
    const source = read(...segments);
    expect(source).toMatch(/import \{ BackHeader \} from "\.\.\/(\.\.\/)?(\.\.\/)?components\/BackHeader";/);
    expect(source).toMatch(/<BackHeader/);
    expect(source).not.toContain("← Back");
  });
});

describe("the tab bar", () => {
  const layout = read("_layout.tsx");

  it("registers every slot candidate and both hubs through the shared rule", () => {
    for (const tab of [...BAR_SLOTS.flat()]) {
      expect(layout).toMatch(new RegExp(`name="${tab}"[\\s\\S]{0,120}href: show\\("${tab}"\\)`));
    }
    expect(layout).toMatch(/isTabOnBar/);
  });

  it("declares the slots in bar order", () => {
    // expo-router lays the bar out in declaration order, so the five slots
    // must be declared first and in sequence — Home, Orders (Kitchen), POS,
    // Reports, Manage — or the fixed bar is fixed in the wrong order.
    const order = ["dashboard", "orders", "kitchen", "pos", "reports", "menu"].map(
      (tab) => layout.indexOf(`name="${tab}"`),
    );
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("no longer reads a stored view", () => {
    expect(layout).not.toMatch(/workspace-store|activeWorkspace/);
  });

  it("sizes itself from the safe-area inset rather than a fixed height", () => {
    expect(layout).toMatch(/useSafeAreaInsets/);
    expect(layout).not.toMatch(/height:\s*85\b/);
  });

  it("takes every tab label from the shared presentation registry", () => {
    expect(layout).not.toMatch(/tabBarLabel:\s*"/);
  });
});
