/**
 * Guardrails for the screens that read orders without a tab permission of
 * their own: Home, the QR scanner and the app-wide order watchers.
 *
 * The database is about to refuse orders (and the money on them) to an account
 * holding none of ORDER_READ_KEYS. A refused read is not an error — it comes
 * back EMPTY, and on these screens an empty read draws as ₱0 takings and a
 * quiet queue, a confident claim about the merchant's day made on nothing. So
 * each surface asks `canReadOrders` first and, without it, does not read at
 * all and shows nothing that could be mistaken for a figure.
 *
 * Jest here only runs pure-logic roots, so — like the other mount guardrails —
 * this asserts on the sources rather than rendering them.
 */
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

describe("Home without an order-reading grant", () => {
  const screen = read("app", "(main)", "dashboard.tsx");

  it("asks the shared rule whether this account may read orders", () => {
    expect(screen).toMatch(/canReadOrders\(/);
  });

  it("skips every order read for an account that may not make it", () => {
    expect(screen).toMatch(/getDashboardStatsRef,\s*canSeeOrders \? undefined : "skip"/);
    expect(screen).toMatch(/getDashboardStatsByPeriodRef,\s*canSeeOrders \? yesterday : "skip"/);
    expect(screen).toMatch(/getRealtimeQueueRef,\s*canSeeOrders \? undefined : "skip"/);
    expect(screen).toMatch(/isBranchScoped && canSeeOrders/);
  });

  it("draws the takings and the queue only inside the order-reading branch", () => {
    // ₱0 on Home is read as "nothing sold today", never as "you may not see".
    const gateAt = screen.indexOf("canSeeOrders ? (");
    expect(gateAt).toBeGreaterThan(-1);
    expect(screen.indexOf("<HeroRevenueCard")).toBeGreaterThan(gateAt);
    expect(screen.indexOf("<StatusPipeline")).toBeGreaterThan(gateAt);
  });

  it("offers the scanner only to an account that may read orders", () => {
    expect(screen).toMatch(/canScan/);
  });
});

describe("Scan QR without an order-reading grant", () => {
  const screen = read("app", "(main)", "scan.tsx");

  it("refuses politely before the camera opens, since every scan writes an order", () => {
    expect(screen).toMatch(/canReadOrders\(/);
    expect(screen).toMatch(/SCAN_NEEDS_ORDERS_MESSAGE/);
    // The refusal sits ahead of the camera-permission gate, so an account that
    // cannot use the scanner is never asked for the camera either.
    const refusalAt = screen.indexOf("if (!canSeeOrders)");
    const cameraGateAt = screen.indexOf("if (!permission)");
    expect(refusalAt).toBeGreaterThan(-1);
    expect(refusalAt).toBeLessThan(cameraGateAt);
  });
});

describe("app-wide order watchers", () => {
  const layout = read("app", "(main)", "_layout.tsx");

  it("mounts the ringtone and the auto-print watchers only for an account that may read orders", () => {
    // They would subscribe, be refused silently and wait forever.
    expect(layout).toMatch(/canReadOrders\(/);
    const gateAt = layout.indexOf("{canSeeOrders && (");
    expect(gateAt).toBeGreaterThan(-1);
    for (const watcher of ["<GlobalOrderAlerts", "<GlobalKitchenAutoPrint", "<GlobalReceiptAutoPrint"]) {
      expect(layout.indexOf(watcher)).toBeGreaterThan(gateAt);
    }
  });
});
