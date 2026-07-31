/**
 * The rules deciding whether the phone may state a food cost percentage.
 *
 * Every case here is a way of getting the number WRONG rather than a way of
 * getting it right, because a wrong food cost percentage is worse than an absent
 * one: it is a small, plausible, memorable figure that a merchant will price
 * against.
 */
import { resolveReportRevenue } from "./daily-report-revenue";

describe("the day's takings, as the report may state them", () => {
  it("reports the takings when the account can see the whole store", () => {
    const revenue = resolveReportRevenue({
      isBranchScoped: false,
      isLoading: false,
      stats: { totalRevenue: 12500 },
    });

    expect(revenue).toBe(12500);
  });

  it("passes a genuinely empty day through as zero rather than as unknown", () => {
    // 0 and null part ways here: 0 is the finding "nothing was sold", which the
    // report says out loud, and null is "we could not tell". The shared view
    // module already words the two differently, so collapsing them here would
    // discard a distinction the surface is ready to draw.
    const revenue = resolveReportRevenue({
      isBranchScoped: false,
      isLoading: false,
      stats: { totalRevenue: 0 },
    });

    expect(revenue).toBe(0);
  });

  it("says nothing at all while the query is still in flight", () => {
    // `undefined` means "this caller does not deal in revenue", so the card is
    // absent. Returning null here would flash "sales could not be read" on every
    // cold mount, which is a lie about a query that is merely slow.
    const revenue = resolveReportRevenue({
      isBranchScoped: false,
      isLoading: true,
      stats: undefined,
    });

    expect(revenue).toBeUndefined();
  });

  it("reports unknown once a settled query has produced no figure", () => {
    const revenue = resolveReportRevenue({
      isBranchScoped: false,
      isLoading: false,
      stats: undefined,
    });

    expect(revenue).toBeNull();
  });

  it("reports unknown when the backend answered without a revenue field", () => {
    // An older Convex deployment can answer this query without `totalRevenue`.
    // Reading the missing field as 0 would turn a stale backend into a day that
    // took nothing — and then into a food cost of "no sales recorded".
    const revenue = resolveReportRevenue({
      isBranchScoped: false,
      isLoading: false,
      stats: {},
    });

    expect(revenue).toBeNull();
  });

  it("withholds the figure entirely from a branch-scoped account", () => {
    // THE POINT OF THIS MODULE. `loadDailyReport` reads stock_movements
    // store-wide, while useSafeQuery narrows orders to the account's own branch.
    // Dividing the whole store's stock cost by one branch's sales yields a food
    // cost percentage inflated by roughly the number of branches — a number that
    // looks like a costing crisis and is purely an artefact of two scopes.
    // Absent is the only honest answer until the ledger read is branch-aware.
    const revenue = resolveReportRevenue({
      isBranchScoped: true,
      isLoading: false,
      stats: { totalRevenue: 4000 },
    });

    expect(revenue).toBeUndefined();
  });

  it("withholds from a branch-scoped account even when the query failed", () => {
    // Order matters: "not comparable" outranks "not readable". A branch manager
    // must not be told the sales could not be read, implying the figure would
    // otherwise be theirs to see.
    const revenue = resolveReportRevenue({
      isBranchScoped: true,
      isLoading: false,
      stats: undefined,
    });

    expect(revenue).toBeUndefined();
  });

  it("rejects a negative total rather than reporting it", () => {
    // No backend models a negative day total, so this is a corrupt read. It
    // reaches resolveFoodCostPercent as null, which withholds the ratio, rather
    // than as a negative that would render a negative food cost.
    const revenue = resolveReportRevenue({
      isBranchScoped: false,
      isLoading: false,
      stats: { totalRevenue: -50 },
    });

    expect(revenue).toBeNull();
  });
});

describe("resolveReportRevenue — which backend can actually narrow the takings", () => {
  /**
   * The withholding used to be blanket: any branch-scoped account got nothing.
   * That rested on a premise that is only half true. `useSafeQuery` narrows
   * orders to the account's branch on the PLATFORM backend — the Supabase
   * adapter runs `getDashboardStatsByPeriod` through `scopeToBranch`. The CONVEX
   * query of the same name takes `startDate` and `endDate` and nothing else, and
   * the ref is deliberately absent from CONVEX_BRANCH_SCOPED_REFS because
   * sending an unknown argument blanks the screen on any deployment below v15.
   *
   * So once the ledger read is branch-aware the two backends part company, and
   * they part in OPPOSITE directions:
   *
   *  - platform: branch stock over branch sales — comparable, and shown.
   *  - convex:   branch stock over STORE-WIDE sales. The numerator shrinks while
   *              the denominator does not, so the food cost comes out far too
   *              LOW. That is the dangerous direction: an inflated figure looks
   *              like a crisis and gets investigated, a flattering one gets
   *              believed.
   */
  it("gives a branch manager their takings when the backend scoped them", () => {
    const revenue = resolveReportRevenue({
      isBranchScoped: true,
      isRevenueBranchScoped: true,
      isLoading: false,
      stats: { totalRevenue: 4000 },
    });

    expect(revenue).toBe(4000);
  });

  it("still withholds when the backend could not narrow the takings", () => {
    const revenue = resolveReportRevenue({
      isBranchScoped: true,
      isRevenueBranchScoped: false,
      isLoading: false,
      stats: { totalRevenue: 4000 },
    });

    expect(revenue).toBeUndefined();
  });

  it("leaves a store-wide account untouched whatever the backend does", () => {
    // An owner reads the whole store on both halves, so branch narrowing is
    // irrelevant to them and must not become a way to lose their figure.
    for (const isRevenueBranchScoped of [true, false]) {
      expect(
        resolveReportRevenue({
          isBranchScoped: false,
          isRevenueBranchScoped,
          isLoading: false,
          stats: { totalRevenue: 4000 },
        }),
      ).toBe(4000);
    }
  });

  it("keeps withholding when nothing says the takings were narrowed", () => {
    // Absent means "not established", never "assume yes". A caller that has not
    // been taught this distinction must not start publishing incomparable
    // figures merely by not mentioning it.
    const revenue = resolveReportRevenue({
      isBranchScoped: true,
      isLoading: false,
      stats: { totalRevenue: 4000 },
    });

    expect(revenue).toBeUndefined();
  });
});
