// Guardrail: every tab the Business view claims must exist as a screen, mount
// the view switcher, and — for the portfolio — actually drill into a branch.
// Jest only runs pure-logic roots (lib/, theme/), so this asserts on the screen
// sources rather than rendering them, the same way workspace-switcher-mount
// does for the Register view.
import { existsSync, readFileSync } from "fs";
import { join } from "path";

import { getWorkspace } from "./workspaces";

const SCREENS_DIR = join(__dirname, "..", "app", "(main)");

function screenPath(tab: string): string {
  return join(SCREENS_DIR, `${tab}.tsx`);
}

describe("Business view screens", () => {
  const businessTabs = getWorkspace("business").tabs;

  it.each(businessTabs)("has a route file for %s", (tab) => {
    // A registered tab with no route file breaks the tab bar for every
    // account, not just the owner who was meant to see it.
    expect(existsSync(screenPath(tab))).toBe(true);
  });

  it.each(businessTabs)("imports the WorkspaceSwitcher in %s", (tab) => {
    expect(readFileSync(screenPath(tab), "utf8")).toMatch(
      /import \{ WorkspaceSwitcher \} from "\.\.\/\.\.\/components\/WorkspaceSwitcher";/,
    );
  });
});

describe("portfolio screen", () => {
  const source = () => readFileSync(screenPath("portfolio"), "utf8");

  it("drills into a branch by setting the viewing context", () => {
    // The whole feature is that tapping a card narrows the other views. It can
    // only do that through the branch-context store.
    expect(source()).toMatch(/useBranchContextStore/);
    expect(source()).toMatch(/selectBranch/);
  });

  it("lists branches from the account's own scope, not the viewed one", () => {
    // Using useBranchScope here would collapse the portfolio to the single
    // branch just drilled into, leaving no way back to the list.
    expect(source()).toMatch(/useAccountBranchScope/);
    expect(source()).not.toMatch(/\buseBranchScope\b/);
  });
});
