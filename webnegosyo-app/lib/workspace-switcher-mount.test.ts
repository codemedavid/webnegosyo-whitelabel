// Guardrail: every tab screen owned by the Register view must mount the view
// switcher, so a cashier can leave the register without first hopping to
// another view's tab. Jest only runs pure-logic roots (lib/, theme/), so this
// asserts on the screen sources rather than rendering them.
import { readFileSync } from "fs";
import { join } from "path";

import { getWorkspace } from "./workspaces";

const SCREENS_DIR = join(__dirname, "..", "app", "(main)");

function readScreen(tab: string): string {
  return readFileSync(join(SCREENS_DIR, `${tab}.tsx`), "utf8");
}

describe("Register view screens", () => {
  const registerTabs = getWorkspace("register").tabs;

  it("owns the counter-sale tabs", () => {
    expect(registerTabs).toEqual(["pos", "pos-sales"]);
  });

  it.each(registerTabs)("imports the WorkspaceSwitcher in %s", (tab) => {
    expect(readScreen(tab)).toMatch(
      /import \{ WorkspaceSwitcher \} from "\.\.\/\.\.\/components\/WorkspaceSwitcher";/,
    );
  });

  it.each(registerTabs)("renders the WorkspaceSwitcher in %s", (tab) => {
    expect(readScreen(tab)).toContain("<WorkspaceSwitcher />");
  });
});
