/**
 * Guardrails for the merchant app's Products (product analytics) screen.
 *
 * Jest here only runs pure-logic roots (lib/, theme/), so — like the other
 * mount guardrails in this directory — this asserts on the screen source rather
 * than rendering it. What it locks down is the wiring a unit test of the pure
 * modules cannot see: that the daily view is actually reachable, that it reads
 * orders through the shared refs instead of querying Supabase inline, and that
 * every filter and ranking decision defers to the tested pure core rather than
 * being re-derived next to the JSX.
 */
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

const screen = read("app", "(main)", "product-analytics.tsx");

describe("daily product analytics data source", () => {
  it("reads orders and line items through the shared backend refs", () => {
    // Both refs are served by Convex AND the platform Supabase adapter, so the
    // daily view works on either backend without a per-tenant deploy.
    expect(screen).toMatch(/orders:getOrders/);
    expect(screen).toMatch(/orders:getAllOrderItems/);
  });

  it("does not query the orders tables directly from the screen", () => {
    expect(screen).not.toMatch(/from\("orders"\)/);
    expect(screen).not.toMatch(/from\("order_items"\)/);
  });

  it("waits for a tenant before loading the menu", () => {
    expect(screen).toMatch(/if \(!tenantId\) return/);
  });

  it("loads the category of each menu item so the category filter has data", () => {
    expect(screen).toMatch(/category_id/);
  });
});

describe("daily product analytics computation", () => {
  it("derives every daily number from the shared pure core", () => {
    expect(screen).toMatch(/buildProductAnalytics/);
  });

  it("computes period-over-period movement through the shared delta helper", () => {
    expect(screen).toMatch(/computeProductDeltas/);
    expect(screen).toMatch(/previousWindow/);
  });

  it("resolves date windows through the tested presets, never inline date maths", () => {
    // An inline `Date.now() - 7 * 86400000` would bucket on the UTC day and
    // silently shift a PH merchant's numbers by eight hours.
    expect(screen).toMatch(/resolveDateWindow/);
    expect(screen).not.toMatch(/24 \* 60 \* 60 \* 1000/);
  });

  it("offers the single-day picker built from days that actually have orders", () => {
    expect(screen).toMatch(/listAvailableDays/);
    expect(screen).toMatch(/resolveSingleDayWindow/);
  });
});

describe("daily product analytics filters", () => {
  it("renders the filter catalogues from the shared options", () => {
    expect(screen).toMatch(/DATE_RANGE_PRESETS/);
    expect(screen).toMatch(/METRIC_OPTIONS/);
    expect(screen).toMatch(/TOP_N_OPTIONS/);
    expect(screen).toMatch(/SOURCE_OPTIONS/);
  });

  it("lets the merchant search products by name", () => {
    expect(screen).toMatch(/placeholder="Search products"/);
  });

  it("keeps a way back to the lifetime BCG view", () => {
    // The daily view is additive — the existing portfolio/cost workflow must
    // not be replaced by it.
    expect(screen).toMatch(/bcgClassification/);
    expect(screen).toMatch(/setCost/);
  });

  it("still lets the merchant pull to refresh", () => {
    expect(screen).toMatch(/RefreshControl/);
  });
});

describe("daily product analytics presentation", () => {
  // The day-by-day rows are rendered by an extracted presentational component;
  // the screen owns the wiring, the component owns the markup.
  const breakdown = read("components", "DailyProductBreakdown.tsx");

  it("shows units, order count, and peso sales for each product row", () => {
    expect(breakdown).toMatch(/formatPeso/);
    expect(breakdown).toMatch(/formatCount/);
    expect(breakdown).toMatch(/units/);
    expect(breakdown).toMatch(/orders/);
  });

  it("labels each day through the shared relative formatter", () => {
    expect(screen).toMatch(/formatDayLabel/);
    expect(breakdown).toMatch(/formatDayLabel/);
  });

  it("tells the merchant when top-N is hiding products rather than silently truncating", () => {
    expect(breakdown).toMatch(/truncatedCount > 0/);
    expect(breakdown).toMatch(/more product/);
  });

  it("makes no ranking or filtering decision of its own", () => {
    // A second opinion on "which product is top" is exactly what the tested
    // pure core exists to prevent.
    expect(breakdown).not.toMatch(/\.sort\(/);
    expect(breakdown).not.toMatch(/\.filter\(/);
  });
});
