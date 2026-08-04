/**
 * The reach bar's arithmetic.
 *
 * The Customers screen used to lead with four stat tiles. Four numbers side by
 * side do not say the one thing the merchant needs — what SHARE of their guest
 * list they can actually text — and three of the four were not actionable. A
 * single proportional bar says it in one object, and every band is a filter.
 *
 * The arithmetic lives here rather than in the screen because of the one trap
 * it contains: `CustomerListStats` has no `suppressed` count, so the four
 * counts it does carry can add up to LESS than `total`. A bar built by naively
 * dividing each count by the total leaves an unexplained gap, and the merchant
 * is left staring at guests who are in the list and in no band.
 */

import { buildReachSegments, reachHeadline } from "./reach-bar";
import type { CustomerListStats } from "./customer-list";

function stats(overrides: Partial<CustomerListStats> = {}): CustomerListStats {
  return { total: 0, textable: 0, noConsent: 0, optedOut: 0, noPhone: 0, ...overrides };
}

describe("buildReachSegments", () => {
  it("puts the guests who can be texted first, because that is the number that matters", () => {
    const segments = buildReachSegments(
      stats({ total: 10, textable: 4, noConsent: 6 })
    );

    expect(segments[0].status).toBe("textable");
    expect(segments[0].count).toBe(4);
  });

  it("gives each band its share of the whole list", () => {
    const segments = buildReachSegments(stats({ total: 10, textable: 4, noConsent: 6 }));

    expect(segments[0].share).toBeCloseTo(0.4);
    expect(segments[1].share).toBeCloseTo(0.6);
  });

  it("accounts for blocked guests the stats never counted", () => {
    // total 10, but the four named counts only reach 8. Those two are
    // suppressed — a status `CustomerListStats` has no field for. Without this
    // band the bar silently loses 20% of the list.
    const segments = buildReachSegments(
      stats({ total: 10, textable: 3, noConsent: 3, optedOut: 1, noPhone: 1 })
    );
    const blocked = segments.find((segment) => segment.status === "suppressed");

    expect(blocked?.count).toBe(2);
  });

  it("adds up to the whole list, so the bar can never show a gap", () => {
    const segments = buildReachSegments(
      stats({ total: 12, textable: 2, noConsent: 5, optedOut: 2, noPhone: 1 })
    );
    const counted = segments.reduce((sum, segment) => sum + segment.count, 0);

    expect(counted).toBe(12);
    expect(segments.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1);
  });

  it("drops the bands that are empty, rather than drawing invisible slivers", () => {
    const segments = buildReachSegments(stats({ total: 5, textable: 5 }));

    expect(segments).toHaveLength(1);
    expect(segments[0].status).toBe("textable");
  });

  it("returns nothing at all for an empty database", () => {
    // A bar drawn over zero guests would divide by zero and read as a claim
    // about a list that does not exist yet.
    expect(buildReachSegments(stats())).toEqual([]);
  });

  it("only offers a filter for the bands the list can actually narrow to", () => {
    const segments = buildReachSegments(
      stats({ total: 10, textable: 2, noConsent: 3, optedOut: 3, noPhone: 2 })
    );
    const byStatus = Object.fromEntries(segments.map((s) => [s.status, s.filter]));

    expect(byStatus.textable).toBe("textable");
    expect(byStatus.no_consent).toBe("no_consent");
    expect(byStatus.opted_out).toBe("opted_out");
    expect(byStatus.no_phone).toBe("no_phone");
  });

  it("leaves the blocked band unfilterable, because it is not one the list carries", () => {
    const segments = buildReachSegments(stats({ total: 4, textable: 2 }));
    const blocked = segments.find((segment) => segment.status === "suppressed");

    expect(blocked?.filter).toBeNull();
  });
});

describe("reachHeadline", () => {
  it("leads with the count that can be texted", () => {
    expect(reachHeadline(stats({ total: 40, textable: 12 })).value).toBe(12);
  });

  it("says who the number is out of, so it reads as a share not a total", () => {
    expect(reachHeadline(stats({ total: 40, textable: 12 })).sentence).toBe(
      "of 40 guests can be texted"
    );
  });

  it("speaks singular for one guest", () => {
    expect(reachHeadline(stats({ total: 1, textable: 1 })).sentence).toBe(
      "of 1 guest can be texted"
    );
  });

  it("does not claim a share when there is nobody on the list", () => {
    expect(reachHeadline(stats()).sentence).toBe("No guests yet");
  });
});
