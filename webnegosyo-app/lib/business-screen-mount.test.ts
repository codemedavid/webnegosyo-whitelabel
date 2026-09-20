// Guardrail: every tab the Business section claims must exist as a screen,
// read the un-narrowed account scope, and — for the portfolio — actually drill
// into a branch. Jest only runs pure-logic roots (lib/, theme/), so this
// asserts on the screen sources rather than rendering them.
import { existsSync, readFileSync } from "fs";
import { join } from "path";

import { getWorkspace, WORKSPACES } from "./workspaces";

const SCREENS_DIR = join(__dirname, "..", "app", "(main)");

function screenPath(tab: string): string {
  return join(SCREENS_DIR, `${tab}.tsx`);
}

describe("Business section screens", () => {
  const businessTabs = getWorkspace("business").tabs;

  it.each(businessTabs)("has a route file for %s", (tab) => {
    // A registered tab with no route file breaks the tab bar for every
    // account, not just the owner who was meant to see it.
    expect(existsSync(screenPath(tab))).toBe(true);
  });

  it.each(businessTabs)("reads the un-narrowed account scope in %s", (tab) => {
    // Business is the view of the company, so its screens must keep showing
    // every branch while one of them is being viewed. The shift screens are
    // the ones that narrow.
    expect(readFileSync(screenPath(tab), "utf8")).not.toMatch(
      /import \{[^}]*\buseBranchScope\b[^}]*\}/,
    );
  });
});

describe("tab registration", () => {
  const layout = () => readFileSync(join(SCREENS_DIR, "_layout.tsx"), "utf8");
  const everyTab = WORKSPACES.flatMap((workspace) => [...workspace.tabs]);

  it.each(everyTab)("gates %s through the shared visibility rule", (tab) => {
    // A route file with no <Tabs.Screen> entry is still registered by
    // expo-router, with default options — so it appears on the bar and
    // ignores staff permissions. That is how the Branches tab once shipped
    // visible to a cashier.
    expect(layout()).toMatch(
      new RegExp(`name="${tab}"[\\s\\S]{0,120}href: show\\("${tab}"\\)`),
    );
  });
});

describe("portfolio screen", () => {
  const source = () => readFileSync(screenPath("portfolio"), "utf8");

  it("drills into a branch by setting the viewing context", () => {
    // The whole feature is that tapping a card narrows the shift screens. It
    // can only do that through the branch-context store.
    expect(source()).toMatch(/useBranchContextStore/);
    expect(source()).toMatch(/selectBranch/);
  });

  it("lists branches from the account's own scope, not the viewed one", () => {
    // Using useBranchScope here would collapse the portfolio to the single
    // branch just drilled into, leaving no way back to the list.
    expect(source()).toMatch(/useAccountBranchScope/);
    expect(source()).not.toMatch(/import \{[^}]*\buseBranchScope\b[^}]*\}/);
  });
});
