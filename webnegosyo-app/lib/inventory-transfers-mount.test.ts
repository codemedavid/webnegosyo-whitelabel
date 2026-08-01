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

describe("acting on a draft from the phone", () => {
  const panel = read("components", "TransferBenchPanel.tsx");

  it("offers a draft its own actions", () => {
    // Composing on a phone is create-then-send, two calls. If the send half
    // fails, a draft is left behind — and a panel that could only receive
    // would strand it somewhere only the web admin could finish it.
    expect(panel).toMatch(/isAwaitingDispatch/);
    expect(panel).toMatch(/onSend/);
    expect(panel).toMatch(/onCancel/);
  });
});

describe("composing a transfer on the phone", () => {
  it("exists as its own component", () => {
    expect(existsSync(join(ROOT, "components", "TransferComposeSheet.tsx"))).toBe(true);
  });

  const sheet = read("components", "TransferComposeSheet.tsx");

  it("offers only what the source branch is holding", () => {
    // Never the catalogue and never the roll-up: a chain holding 700g of flour
    // across four shops cannot send 700g out of one of them.
    expect(sheet).toMatch(/ingredientsAvailableAt/);
    expect(sheet).toMatch(/overDraftedItemIds/);
  });

  it("judges the draft through the shared rules rather than beside the JSX", () => {
    expect(sheet).toMatch(/describeDraftProblem/);
    expect(sheet).toMatch(/parseTransferQuantity/);
    expect(sheet).toMatch(/canSendFrom/);
  });

  it("reads the source branch's own shelf rather than reusing the one on screen", () => {
    // The visible shelf is the roll-up whenever an owner is looking at the
    // whole store, so composing from it would offer the chain's stock.
    expect(sheet).toMatch(/loadInventoryStock/);
  });
});

describe("the inventory screen", () => {
  const screen = read("app", "(main)", "inventory.tsx");

  it("shows the bench panel", () => {
    expect(screen).toMatch(/TransferBenchPanel/);
  });

  it("can start a transfer even when none has ever been made", () => {
    // The bench panel renders nothing until something has moved, so a compose
    // entry inside it would leave a store that has never transferred unable to
    // ever start one.
    expect(screen).toMatch(/TransferComposeSheet/);
    const panelAt = screen.indexOf("<TransferBenchPanel");
    const composeAt = screen.indexOf("<TransferComposeSheet");
    expect(composeAt).toBeGreaterThan(-1);
    expect(composeAt).not.toBe(panelAt);
  });

  it("offers composing only to a store with more than one branch", () => {
    // A single-shop tenant has nowhere to send anything.
    expect(screen).toMatch(/outlets\.length > 1/);
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
