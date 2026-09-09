/**
 * Turning the platform's overview payload into what the Hub screen draws.
 *
 * The arithmetic lives on the platform (`src/lib/customer-hub-overview.ts`) so
 * the repeat-rate definition exists once. What is left here is presentation —
 * and the one rule that matters is that an UNQUALIFIED number must never be
 * drawn as a confident one. A 40% repeat rate computed from a ledger that only
 * saw a third of the orders is not a fact about the business.
 */
import {
  describeCoverage,
  formatRate,
  selectWindow,
  type HubOverview,
} from "./overview";

const OVERVIEW: HubOverview = {
  windows: [
    {
      days: 7,
      repeatRate: 25,
      previousRepeatRate: 20,
      repeatRateChange: 5,
      identifiedCustomers: 4,
      returningCustomers: 1,
      newCustomers: 3,
      atRiskCustomers: 0,
      identifiedOrders: 4,
      qualifiedOrders: 5,
      identifiedOrderCoverage: 80,
      periodStart: "2026-08-28T12:00:00.000Z",
      periodEnd: "2026-09-04T12:00:00.000Z",
    },
    {
      days: 30,
      repeatRate: 40,
      previousRepeatRate: 45,
      repeatRateChange: -5,
      identifiedCustomers: 10,
      returningCustomers: 4,
      newCustomers: 6,
      atRiskCustomers: 2,
      identifiedOrders: 10,
      qualifiedOrders: 30,
      identifiedOrderCoverage: 33.3,
      periodStart: "2026-08-05T12:00:00.000Z",
      periodEnd: "2026-09-04T12:00:00.000Z",
    },
  ],
  topItems: [],
  coverage: { complete: true },
};

describe("selectWindow", () => {
  it("returns the requested window", () => {
    expect(selectWindow(OVERVIEW, 30)?.repeatRate).toBe(40);
  });

  it("returns null for a window the platform did not send", () => {
    expect(selectWindow(OVERVIEW, 90)).toBeNull();
  });
});

describe("formatRate", () => {
  it("renders a whole percentage", () => {
    expect(formatRate(40)).toBe("40%");
  });

  it("keeps one decimal only when it carries information", () => {
    expect(formatRate(33.3)).toBe("33.3%");
  });

  it("renders no-data as a dash, never as 0%", () => {
    // 0% means "nobody came back". No identified customers means "we cannot
    // tell", and drawing that as 0% invents a bad result out of no result.
    expect(formatRate(null)).toBe("—");
  });
});

describe("describeCoverage", () => {
  it("says nothing when the ledger saw every order", () => {
    expect(
      describeCoverage({ ...OVERVIEW.windows[0], identifiedOrderCoverage: 100 }, { complete: true })
    ).toBeNull();
  });

  it("qualifies the rate when most orders were anonymous", () => {
    const note = describeCoverage(OVERVIEW.windows[1], { complete: true });

    expect(note).toContain("33%");
  });

  it("surfaces a reader problem ahead of the coverage percentage", () => {
    const note = describeCoverage(OVERVIEW.windows[1], {
      complete: false,
      note: "Customer ledger could not be reached.",
    });

    expect(note).toBe("Customer ledger could not be reached.");
  });
});
