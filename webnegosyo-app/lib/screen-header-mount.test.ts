// Guardrail: every tab screen draws its header with the shared ScreenHeader,
// and every pushed detail screen with BackHeader. Before these existed each
// screen hand-rolled its own title row with a hard-coded 60pt top gap, so the
// app read as seventeen unrelated screens and the notch inset was a guess.
// Jest only runs pure-logic roots, so this asserts on screen sources.
import { existsSync, readFileSync } from "fs";
import { join } from "path";

import { WORKSPACES } from "./workspaces";
import { MENU_TAB } from "./tab-visibility";

const SCREENS_DIR = join(__dirname, "..", "app", "(main)");

function read(...segments: string[]): string {
  return readFileSync(join(SCREENS_DIR, ...segments), "utf8");
}

const TAB_SCREENS = [...WORKSPACES.flatMap((w) => [...w.tabs]), MENU_TAB];

const DETAIL_SCREENS: string[][] = [
  ["account.tsx"],
  ["printer-settings.tsx"],
  ["team.tsx"],
  ["order", "[orderId].tsx"],
];

describe("tab screens", () => {
  it("includes the Menu hub as a route", () => {
    expect(existsSync(join(SCREENS_DIR, `${MENU_TAB}.tsx`))).toBe(true);
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

  it("registers the Menu hub as an always-visible tab", () => {
    expect(layout).toMatch(/name="menu"/);
    expect(layout).toMatch(/isTabOnBar/);
  });

  it("sizes itself from the safe-area inset rather than a fixed height", () => {
    expect(layout).toMatch(/useSafeAreaInsets/);
    expect(layout).not.toMatch(/height:\s*85\b/);
  });

  it("takes every tab label from the shared presentation registry", () => {
    expect(layout).not.toMatch(/tabBarLabel:\s*"/);
  });
});
