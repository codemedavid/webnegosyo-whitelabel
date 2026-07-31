/**
 * Guardrails for the merchant app's Daily Report screen.
 *
 * Jest here only runs pure-logic roots (lib/, theme/), so — like
 * `inventory-screen-mount.test.ts` and the other mount guardrails — this
 * asserts on the screen sources rather than rendering them. What it locks down
 * is the wiring a unit test of the pure modules cannot see: that the tab is
 * registered and permission-gated, that the screen gates on the tenant, and
 * that it defers every judgement about the day to the parity-guarded core
 * instead of re-deriving one beside the JSX.
 *
 * The last of those is the whole point of Phase 4. A screen that decided for
 * itself what counts as a bad day would be a second opinion on the same
 * ledger, and the merchant would have two verdicts about one day with no way
 * to choose between them.
 */
import { readFileSync } from "fs";
import { join } from "path";

import { WORKSPACES, workspaceForTab } from "./workspaces";
import { isTabAllowed } from "./staff-permissions";

const ROOT = join(__dirname, "..");

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

const TAB = "daily-report";

describe("daily report tab registration", () => {
  const layout = read("app", "(main)", "_layout.tsx");

  it("registers the route as a tab", () => {
    expect(layout).toMatch(/name="daily-report"/);
  });

  it("gates the tab through the workspace and permission check like every other tab", () => {
    // Without show(), the tab appears in every view and for every staff member
    // regardless of grant.
    expect(layout).toMatch(/href: show\("daily-report"\)/);
  });

  it("belongs to exactly one workspace", () => {
    // The registry's disjointness rule: a tab in two views makes the tab bar
    // depend on which view you came from.
    const owning = WORKSPACES.filter((w) => w.tabs.includes(TAB));

    expect(owning).toHaveLength(1);
  });

  it("sits in Products, beside the shelf it reconciles", () => {
    // Same reasoning the registry already gives for `inventory`: the merchant
    // who counts the flour and the merchant who asks whether the count matched
    // are the same person, standing in the same place. It is not a sales
    // analytic — the phone report carries no revenue at all.
    expect(workspaceForTab(TAB)).toBe("products");
  });

  it("requires a permission rather than defaulting to allowed", () => {
    // An unmapped tab is allowed for everyone — the trap TAB_PERMISSIONS
    // already documents for `branches`. This report names what stock went
    // missing and what it cost, so it must not be the one tab a cashier keeps.
    // `permissions: null` means an owner (full reach), so a staff member with
    // no grants is an empty LIST, not a null.
    const holderOfNothing = { role: "admin", permissions: [] } as never;

    expect(isTabAllowed(holderOfNothing, TAB)).toBe(false);
  });

  it("rides the same grant as the inventory tab", () => {
    // The report is the shelf the inventory tab shows, reconciled. Whoever may
    // see the stock may see whether it added up.
    const holderOfMenu = { role: "admin", permissions: ["menu"] } as never;

    expect(isTabAllowed(holderOfMenu, TAB)).toBe(isTabAllowed(holderOfMenu, "inventory"));
    expect(isTabAllowed(holderOfMenu, TAB)).toBe(true);
  });
});

describe("daily report screen", () => {
  const screen = read("app", "(main)", "daily-report.tsx");

  it("loads through the shared read rather than querying Supabase inline", () => {
    expect(screen).toMatch(/loadDailyReport/);
    expect(screen).not.toMatch(/from\("stock_movements"\)/);
  });

  it("waits for a tenant before loading", () => {
    // The auth store starts empty; loading on a cold mount would query for
    // every tenant at once.
    expect(screen).toMatch(/if \(!tenantId\) return/);
  });

  it("takes its verdict from the shared rules, never beside the JSX", () => {
    // A screen that compared shrinkage to COGS itself would be the second
    // opinion this whole phase exists to prevent.
    expect(screen).toMatch(/judgeVariance/);
    expect(screen).not.toMatch(/shrinkageCost\s*\/\s*/);
  });

  it("takes its wording and its money formatting from the shared view module", () => {
    expect(screen).toMatch(/describeReportCaveats/);
    expect(screen).toMatch(/formatPeso/);
    // Hand-rolled formatting is how the two surfaces start disagreeing about
    // the same number; `toLocaleString` is also the repo's twice-shipped bug.
    expect(screen).not.toMatch(/toLocaleString/);
  });

  it("chooses the day through the shared resolver", () => {
    // Defaults to yesterday and refuses a future day. Today is always
    // mid-service and reads short.
    expect(screen).toMatch(/resolveReportDay/);
  });

  it("lets the merchant walk back through previous days", () => {
    expect(screen).toMatch(/previousBusinessDayKey/);
  });

  it("names the day in words rather than as a raw key", () => {
    expect(screen).toMatch(/formatBusinessDayLabel/);
  });

  it("lets the merchant pull the day down to reload it", () => {
    expect(screen).toMatch(/RefreshControl/);
  });

  it("offers a retry when the read fails instead of showing an empty day", () => {
    // `loadDailyReport` returns null on failure precisely so this can tell the
    // difference. An empty report reads as "nothing moved today", which is the
    // most misleading thing this screen could say.
    expect(screen).toMatch(/ErrorState/);
  });

  it("keeps the workspace switcher so the tab is escapable", () => {
    expect(screen).toMatch(/WorkspaceSwitcher/);
  });

  it("reads the day's takings through the same string ref every other screen uses", () => {
    // The app needs no backend router ported from the web: the ref is served by
    // Convex or by the platform adapter without the screen knowing which.
    expect(screen).toMatch(/getDashboardStatsByPeriod/);
  });

  it("asks for the takings over the SAME Manila window as the ledger", () => {
    // A revenue window that disagreed with the stock window by even an hour
    // would put late-night sales against the previous day's stock. Both come
    // from resolveBusinessDayWindow so they cannot drift apart.
    expect(screen).toMatch(/resolveBusinessDayWindow/);
  });

  it("decides whether it may state a food cost rather than dividing inline", () => {
    // The scope mismatch is the reason this decision is a tested module and not
    // a `?:` beside the JSX.
    expect(screen).toMatch(/resolveReportRevenue/);
    expect(screen).not.toMatch(/totalRevenue\s*\)\s*\*\s*100/);
  });

  it("takes the percentage itself from the parity-guarded core", () => {
    expect(screen).toMatch(/resolveFoodCostPercent/);
    expect(screen).toMatch(/formatFoodCostPercent/);
  });

  it("explains a withheld figure instead of leaving a blank tile", () => {
    // describeRevenueCaveat words "could not be read" and "nothing was sold"
    // differently. Both render above the figures, like every other caveat.
    expect(screen).toMatch(/describeRevenueCaveat/);
  });

  it("never lets an unreadable day render as zero takings", () => {
    // The single most dangerous line this screen could contain. A `?? 0` on the
    // revenue would turn a dropped connection into a flawless-looking day.
    expect(screen).not.toMatch(/revenue\s*\?\?\s*0/);
  });

  it("leads with the verdict, above the caveats and the figures", () => {
    // Same order as the web panel. A merchant who reads the numbers first has
    // already formed an opinion by the time the caveat explains the numbers
    // cannot support one.
    // Compared at the JSX usages, not the imports — an import list is
    // alphabetised by tooling and says nothing about render order.
    const verdictAt = screen.indexOf("<DailyReportVerdict");
    const caveatAt = screen.indexOf("caveats.map");
    const totalsAt = screen.indexOf("<Total");

    expect(verdictAt).toBeGreaterThan(-1);
    expect(verdictAt).toBeLessThan(caveatAt);
    expect(caveatAt).toBeLessThan(totalsAt);
  });
});

describe("daily report row card", () => {
  const card = read("components", "DailyReportRowCard.tsx");

  it("reads each row out as a sentence for assistive technology", () => {
    expect(card).toMatch(/accessibilityLabel/);
  });

  it("formats every figure through the shared view module", () => {
    expect(card).toMatch(/formatPeso/);
    expect(card).toMatch(/formatQuantity/);
  });

  it("names stock moved to or from another branch", () => {
    // A transfer is neither usage nor a loss, so it has no figure of its own in
    // the flow — but it moves the closing balance, and an unexplained gap on a
    // stock report invites exactly the wrong conclusion.
    expect(card).toMatch(/transferred/);
  });

  it("says outright when an ingredient was never counted", () => {
    // An uncounted ingredient and a perfectly reconciled one both show zero
    // shrinkage. Without the distinction the card quietly reassures.
    expect(card).toMatch(/wasCounted/);
  });
});
