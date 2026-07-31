/**
 * Guardrails for transfers on the merchant app's Inventory screen.
 *
 * Jest here only runs pure-logic roots (lib/, theme/), so — like the other
 * mount guardrails in this directory — this asserts on the sources rather than
 * rendering them. What it locks is the wiring the pure tests cannot see: that
 * receiving is reachable from the phone at all, that the screen defers every
 * judgement to the shared pure rules, and above all that transfers did NOT
 * arrive as a new tab.
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

describe("the transfer bench panel", () => {
  it("exists as its own component", () => {
    expect(existsSync(join(ROOT, "components", "TransferBenchPanel.tsx"))).toBe(true);
  });

  const panel = read("components", "TransferBenchPanel.tsx");

  it("orders the list through the shared rule rather than sorting beside the JSX", () => {
    expect(panel).toMatch(/sortTransfersForBench/);
    expect(panel).not.toMatch(/\.sort\(/);
  });

  it("names the direction through the shared rule", () => {
    // The store pool and an unnameable branch both have to degrade correctly,
    // and a second implementation beside the JSX would get one of them wrong.
    expect(panel).toMatch(/describeTransferDirection/);
  });

  it("offers counting in only for a consignment that is actually on its way", () => {
    expect(panel).toMatch(/isAwaitingCount/);
  });

  it("starts each count field at what was sent", () => {
    // Blank would make the honest path the laborious one, which is how the
    // step gets skipped — the same rule the web workbench follows.
    expect(panel).toMatch(/sentQuantity/);
  });
});

describe("the inventory screen", () => {
  const screen = read("app", "(main)", "inventory.tsx");

  it("shows the bench panel", () => {
    expect(screen).toMatch(/TransferBenchPanel/);
  });

  it("reads transfers through the shared service rather than querying inline", () => {
    expect(screen).toMatch(/loadTransfers/);
    expect(screen).not.toMatch(/from\("stock_transfers"\)/);
  });

  it("reloads the shelf after a transfer step", () => {
    // A count that arrives changes the shelf underneath it. Leaving the old
    // figures on screen would show the merchant stock they no longer have.
    expect(screen).toMatch(/onTransferred/);
  });
});

describe("transfers are not a new tab", () => {
  const workspaces = read("lib", "workspaces.ts");
  const layout = read("app", "(main)", "_layout.tsx");

  it("registers no transfers tab in any workspace", () => {
    // A tab registered in the workspace registry with no matching route file
    // breaks the tab bar for EVERY account — the warning at the top of
    // workspaces.ts. Transfers are a rare action and have not earned a
    // permanent slot beside the daily shelf either way.
    expect(workspaces).not.toMatch(/"transfers"/);
    expect(layout).not.toMatch(/name="transfers"/);
  });
});
