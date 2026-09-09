/**
 * Wiring guardrail for the Customer Hub screen.
 *
 * Jest here runs pure-logic roots only, so screens are never rendered. Like the
 * other mount guardrails in this directory, this asserts on the screen source:
 * the things that would fail silently and invisibly if they were forgotten.
 *
 * The tab-permission mapping is the one that matters most. An unmapped tab
 * defaults to ALLOWED, and this screen aggregates the same customer records the
 * guest list protects — so forgetting the mapping would hand a store's
 * retention data to anyone who can ring up a sale.
 */
import fs from "fs";
import path from "path";

import { isTabAllowed } from "./staff-permissions";
import { WORKSPACES } from "./workspaces";

const source = fs.readFileSync(
  path.join(__dirname, "..", "app", "(main)", "customer-hub.tsx"),
  "utf8",
);

describe("customer-hub screen", () => {
  it("is gated by the customers permission, not left unmapped", () => {
    const cashier = { role: "admin", isOwner: false, permissions: ["pos", "orders"] };
    const frontDesk = { role: "admin", isOwner: false, permissions: ["customers"] };

    expect(isTabAllowed(cashier, "customer-hub")).toBe(false);
    expect(isTabAllowed(frontDesk, "customer-hub")).toBe(true);
  });

  it("belongs to exactly one workspace", () => {
    const owning = WORKSPACES.filter((workspace) =>
      workspace.tabs.includes("customer-hub"),
    );

    expect(owning).toHaveLength(1);
  });

  it("refuses to draw anything when the store is outside the pilot", () => {
    // Read locally as well as enforced by the route, so a store that is not in
    // the pilot gets the explanation immediately rather than a spinner.
    expect(source).toMatch(/customerHubEnabled/);
  });

  it("reads its figures from the platform rather than recomputing them", () => {
    // The repeat-rate definition must exist once. A screen computing its own
    // would drift from the web admin port that follows.
    expect(source).toMatch(/fetchHubOverview/);
    expect(source).not.toMatch(/returningCustomers\s*\/\s*identifiedCustomers/);
  });

  it("prints the coverage caveat beside the rate", () => {
    expect(source).toMatch(/describeCoverage/);
  });

  it("distinguishes no-data from a zero rate", () => {
    // formatRate renders null as a dash; passing the raw rate unconditionally
    // would draw "0%" for a store nobody has been identified at yet.
    expect(source).toMatch(/identifiedCustomers > 0 \? window\.repeatRate : null/);
  });
});
