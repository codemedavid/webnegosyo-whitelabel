/**
 * Guardrails for the Register's incoming-orders drawer.
 *
 * Jest here only runs pure-logic roots (lib/, theme/), so — like the other
 * mount guardrails in this directory — this asserts on the sources rather than
 * rendering them. What it locks down is the wiring a unit test of the pure
 * modules cannot see: that the Register actually subscribes to the live queue,
 * that the drawer defers every judgement about what is "incoming" to the shared
 * pure rules, and that the ringtone is no longer gated on Convex alone.
 */
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

describe("incoming orders drawer component", () => {
  const sheet = read("components", "pos", "IncomingOrdersSheet.tsx");

  it("derives its rows and its handle label from the shared pure rules", () => {
    // A drawer that re-derived "is this a counter sale?" beside the JSX would
    // be a second opinion on the one question the pure core exists to answer.
    expect(sheet).toMatch(/formatIncomingHandle/);
    expect(sheet).toMatch(/describeIncomingOrder/);
    expect(sheet).not.toMatch(/"pos"/);
  });

  it("opens the order it is showing rather than dead-ending", () => {
    expect(sheet).toMatch(/onSelect/);
  });

  it("collapses to a handle so it never covers the product grid", () => {
    expect(sheet).toMatch(/isExpanded/);
  });

  it("labels the badge for screen readers", () => {
    expect(sheet).toMatch(/accessibilityLabel/);
  });
});

describe("register screen", () => {
  const screen = read("app", "(main)", "pos.tsx");

  it("subscribes to the live order queue so web orders arrive without a refresh", () => {
    expect(screen).toMatch(/getRealtimeQueue/);
    expect(screen).toMatch(/useSafeQuery/);
  });

  it("mounts the incoming drawer alongside the sale", () => {
    expect(screen).toMatch(/IncomingOrdersSheet/);
  });

  it("filters the queue through the shared rule, never inline", () => {
    expect(screen).toMatch(/selectIncomingOrders/);
    expect(screen).not.toMatch(/source === "pos"/);
  });

  it("clears the unseen badge when the cashier opens the drawer", () => {
    // A badge that survives being read is noise the cashier learns to ignore.
    expect(screen).toMatch(/countUnseenIncoming/);
  });

  it("routes a tapped order to its detail screen", () => {
    expect(screen).toMatch(/\/\(main\)\/order\//);
  });

  it("opens the register for any tenant with a live order backend, not Convex only", () => {
    // Counter sales are already writable against the platform database
    // (`orders:createOrder` is a supported platform ref), so gating the whole
    // register on a Convex url locked those merchants out of their own POS.
    expect(screen).toMatch(/hasLiveOrderBackend/);
    expect(screen).not.toMatch(/if \(!convexUrl\)/);
  });

  it("keeps the sale drawer and the incoming drawer from stacking open", () => {
    // Two bottom sheets expanded at once would bury the grid entirely.
    expect(screen).toMatch(/setIsIncomingExpanded/);
  });
});

describe("tender screen", () => {
  const screen = read("app", "(main)", "pos-tender.tsx");

  it("accepts payment for any tenant with a live order backend", () => {
    // The register opening on the platform backend is useless if charging
    // still refuses.
    expect(screen).toMatch(/hasLiveOrderBackend/);
  });
});

describe("app-wide order alerts", () => {
  const alerts = read("components", "GlobalOrderAlerts.tsx");

  it("decides audibility through the shared gate instead of a Convex url check", () => {
    expect(alerts).toMatch(/shouldAlertOnNewOrders/);
    expect(alerts).not.toMatch(/if \(!convexUrl \|\| isDemo\)/);
  });
});
