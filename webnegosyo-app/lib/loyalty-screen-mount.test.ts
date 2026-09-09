/**
 * Wiring guardrail for the Rewards (loyalty) screen. Screens are never
 * rendered here; this asserts on the source for the things that fail silently.
 *
 * The permission mapping matters most: an unmapped tab defaults to ALLOWED,
 * and this screen can activate a program and end one — moves that change what
 * every regular is owed.
 */
import fs from "fs";
import path from "path";

import { isTabAllowed } from "./staff-permissions";
import { WORKSPACES } from "./workspaces";

const source = fs.readFileSync(path.join(__dirname, "..", "app", "(main)", "loyalty.tsx"), "utf8");

describe("loyalty screen", () => {
  it("is gated by loyalty_manage, not by customers and not left unmapped", () => {
    const frontDesk = { role: "admin", isOwner: false, permissions: ["customers"] };
    const manager = { role: "admin", isOwner: false, permissions: ["loyalty_manage"] };

    expect(isTabAllowed(frontDesk, "loyalty")).toBe(false);
    expect(isTabAllowed(manager, "loyalty")).toBe(true);
  });

  it("belongs to exactly one workspace", () => {
    expect(WORKSPACES.filter((w) => w.tabs.includes("loyalty"))).toHaveLength(1);
  });

  it("states shadow mode on screen rather than showing Live while nothing is issued", () => {
    expect(source).toMatch(/isShadow/);
    expect(source).toMatch(/Shadow mode/);
  });

  it("validates the form with the shared parser before posting", () => {
    expect(source).toMatch(/parseProgramForm\(form\)/);
  });

  it("offers only the status move the program's state allows", () => {
    expect(source).toMatch(/nextStatusAction\(program\.status\)/);
  });
});
