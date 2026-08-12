/**
 * Guardrails for the Drawer's order-intake wiring.
 *
 * Jest here only runs pure-logic roots, so — like the other mount guardrails in
 * this directory — this asserts on the source rather than rendering it. What it
 * locks down is what a unit test of the pure modules cannot see: that the
 * Drawer really subscribes to the live queue, that it defers every judgement
 * about intake and money to the shared pure rules, and that it never re-states
 * the source filter beside the JSX.
 */
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

describe("drawer screen", () => {
  const screen = read("app", "(main)", "pos-sales.tsx");

  it("subscribes to the live queue so Smart Menu orders arrive without a refresh", () => {
    expect(screen).toMatch(/getRealtimeQueue/);
  });

  it("selects its intake rows through the shared rule, never inline", () => {
    expect(screen).toMatch(/selectDrawerIncoming/);
    // The old screen hard-coded `source === "pos"` twice. The pure core owns
    // that question now; a second opinion beside the JSX is how the two drift.
    expect(screen).not.toMatch(/source === "pos"/);
  });

  it("scopes intake to the cashier's own branch", () => {
    expect(screen).toMatch(/filterQueueToScope/);
    expect(screen).toMatch(/useBranchScope/);
  });

  it("asks the shared gate before offering Confirm, and shows its reason", () => {
    expect(screen).toMatch(/canConfirmFromDrawer/);
  });

  it("confirms through the routed mutation rather than a direct backend call", () => {
    expect(screen).toMatch(/useSafeMutation/);
    expect(screen).toMatch(/orders:updateOrderStatus/);
  });

  it("refuses to write in demo mode", () => {
    expect(screen).toMatch(/isDemo/);
    expect(screen).toMatch(/DEMO_READONLY_MESSAGE/);
  });

  it("passes the merchant's opt-in to the summary instead of deciding locally", () => {
    expect(screen).toMatch(/drawerIncludesOnlineOrders/);
    expect(screen).toMatch(/includeOnlineOrders/);
  });
});
