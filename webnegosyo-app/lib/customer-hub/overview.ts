/**
 * Presentation for the Customer Hub overview.
 *
 * Every number here was computed on the platform — see
 * `src/lib/customer-hub-overview.ts`. This module only decides how to SAY them,
 * and it exists mainly to enforce one rule the screen must not get wrong:
 * an unqualified number is never drawn as a confident one.
 */

export interface HubOverviewWindow {
  days: number;
  repeatRate: number;
  previousRepeatRate: number;
  repeatRateChange: number;
  identifiedCustomers: number;
  returningCustomers: number;
  newCustomers: number;
  atRiskCustomers: number;
  identifiedOrders: number;
  qualifiedOrders: number;
  identifiedOrderCoverage: number;
  periodStart: string;
  periodEnd: string;
}

export interface HubCoverage {
  complete: boolean;
  note?: string;
}

export interface HubOverview {
  windows: HubOverviewWindow[];
  topItems: Array<{ key: string; menuItemId: string | null; name: string; quantity: number }>;
  coverage: HubCoverage;
}

/** Below this share of identified orders, the rate is worth qualifying out loud. */
const COVERAGE_CAUTION = 90;

export function selectWindow(overview: HubOverview, days: number): HubOverviewWindow | null {
  return overview.windows.find((window) => window.days === days) ?? null;
}

/**
 * A percentage, or an em dash when there is no answer.
 *
 * `null` and `0` are different facts: 0% means nobody came back, null means we
 * cannot tell. Rendering the second as the first invents a bad result out of no
 * result, which is the kind of number a merchant acts on.
 */
export function formatRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return "—";
  const rounded = Math.round(rate * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

/**
 * The caveat to print beside the repeat rate, or null when it needs none.
 *
 * A reader problem outranks a coverage percentage: if the ledger could not be
 * read at all, saying "based on 33% of orders" would imply the other 67% were
 * counted and found anonymous, which is a different and much more reassuring
 * claim than the truth.
 */
export function describeCoverage(
  window: HubOverviewWindow,
  coverage: HubCoverage,
): string | null {
  if (!coverage.complete && coverage.note) return coverage.note;
  if (window.identifiedOrderCoverage >= COVERAGE_CAUTION) return null;

  return `Based on ${Math.round(window.identifiedOrderCoverage)}% of orders — the rest were placed without a name or number.`;
}
