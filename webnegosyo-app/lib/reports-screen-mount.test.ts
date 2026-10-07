/**
 * Wiring guardrail for the Reports tab, which opens on the customer dashboard.
 * Screens are never rendered here; this asserts on the source for the things
 * that fail silently — a dashboard asked of the server by an account that may
 * not see customers, a door to a screen the registry does not own, or a "Text
 * them" button that opens a blank campaign instead of a ready one.
 */
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

function readCode(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

const screen = readCode("app", "(main)", "reports.tsx");
const insights = readCode("components", "reports", "CustomerInsights.tsx");
const hooks = readCode("lib", "customer-hub", "use-reports-dashboard.ts");

describe("Reports screen", () => {
  it("asks for customer figures only when this account may see customers", () => {
    expect(screen).toMatch(/isTabReachable\("customers", ctx\)/);
    expect(screen).toMatch(/useCustomerDashboard\(canSeeCustomers\)/);
    expect(hooks).toMatch(/isAllowed && isHubOn && tenantId/);
  });

  it("reads reward cards only for an account that may open Rewards", () => {
    expect(screen).toMatch(/isTabReachable\("loyalty", ctx\)/);
    expect(screen).toMatch(/useRewardsSnapshot\(canSeeCustomers && canSeeRewards\)/);
  });

  it("draws the guest list and Rewards as labelled doors from the shared registry", () => {
    expect(screen).toMatch(/<SubScreenLinks parent="reports" variant="pills" \/>/);
  });

  it("never leaves the page empty: sales lead when customer figures cannot", () => {
    expect(screen).toMatch(/resolveInsightsState\(/);
    expect(screen).toMatch(/needsSalesFallback \? \{ daysBack: days \} : "skip"/);
    expect(screen).toMatch(/<InsightsNotice/);
  });

  it("uses the width of a tablet instead of stretching one column", () => {
    expect(screen).toMatch(/useIsWideReports\(\)/);
    expect(insights).toMatch(/<ReportsColumns isWide=\{isWide\}/);
  });

  it("opens a campaign on its preset, not on a blank form", () => {
    expect(screen).toMatch(/newCampaignFromPresetHref\(action\.target\.preset\)/);
  });

  it("reads the store's switch through the selector that also trusts the platform backend", () => {
    expect(screen).toMatch(/useAuthStore\(selectIsCustomerHubOn\)/);
    expect(hooks).toMatch(/useAuthStore\(selectIsCustomerHubOn\)/);
  });

  it("keeps every other report one tap below, filtered to what the account may open", () => {
    expect(screen).toMatch(/hubSections\(REPORTS_SECTIONS, ctx\)/);
  });

  it("reads the dashboard top to bottom: money, dials, moves, then known buyers, favourites, people", () => {
    const order = ["<RevenueSplitCard", "<LeverTiles", "<BringBackCard", "<KnownBuyersCard", "<FavouritesCard", "<BestCustomersCard"];
    const positions = order.map((tag) => insights.indexOf(tag));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
