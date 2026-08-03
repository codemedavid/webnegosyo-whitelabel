/**
 * Who gets texted.
 *
 * This module is the only place that decides whether a person may receive a
 * marketing SMS, and it is deliberately conservative: every check is a veto,
 * and the eligibility vetoes run BEFORE the merchant's filters. That ordering
 * is not cosmetic — it is what makes the exclusion reason honest. A guest who
 * opted out and also falls outside the filter must be reported as "opted out",
 * because that is the reason the merchant must not override.
 *
 * The output carries the excluded set and a per-reason summary as well as the
 * recipients, so the pre-send screen can say "42 will be texted; 9 skipped: 6
 * never opted in, 3 opted out" instead of quietly showing a smaller number than
 * the merchant expected.
 */

import type {
  AudienceContext,
  AudienceExclusion,
  AudienceFilter,
  AudienceResult,
  ExclusionReason,
  SmsCustomer,
} from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const ALL_REASONS: readonly ExclusionReason[] = [
  "no_phone",
  "no_consent",
  "opted_out",
  "suppressed",
  "recently_texted",
  "filter",
];

/** The first veto that applies, or null when the customer may be texted. */
function eligibilityVeto(
  customer: SmsCustomer,
  suppressed: ReadonlySet<string>,
  recentlyTexted: ReadonlySet<string>
): ExclusionReason | null {
  if (!customer.phone_e164) return "no_phone";
  if (!customer.sms_consent) return "no_consent";
  if (customer.sms_opt_out) return "opted_out";
  if (suppressed.has(customer.phone_e164)) return "suppressed";
  if (recentlyTexted.has(customer.phone_e164)) return "recently_texted";
  return null;
}

/** Whole days between the customer's last order and now; null if never ordered. */
function daysSinceLastOrder(customer: SmsCustomer, now: number): number | null {
  if (!customer.last_order_at) return null;
  const lastOrder = new Date(customer.last_order_at).getTime();
  if (!Number.isFinite(lastOrder)) return null;
  return (now - lastOrder) / MS_PER_DAY;
}

function matchesFilter(customer: SmsCustomer, filter: AudienceFilter, now: number): boolean {
  const elapsed = daysSinceLastOrder(customer, now);

  // A customer who has never ordered sits outside BOTH recency windows: they
  // are neither "lapsed for 30 days" nor "active in the last 30 days", and
  // treating null as infinitely lapsed would blast every stranger in the table.
  if (filter.lastOrderOlderThanDays !== undefined) {
    if (elapsed === null || elapsed <= filter.lastOrderOlderThanDays) return false;
  }
  if (filter.lastOrderWithinDays !== undefined) {
    if (elapsed === null || elapsed > filter.lastOrderWithinDays) return false;
  }
  if (filter.minOrderCount !== undefined && customer.order_count < filter.minOrderCount) {
    return false;
  }
  if (filter.minTotalSpent !== undefined && customer.total_spent < filter.minTotalSpent) {
    return false;
  }
  if (filter.channels !== undefined && filter.channels.length > 0) {
    const used = customer.channels_used ?? [];
    if (!filter.channels.some((channel) => used.includes(channel))) return false;
  }

  return true;
}

/** Most recent order first, so a run truncated by the cap reaches the warmest guests. */
function byRecencyDesc(a: SmsCustomer, b: SmsCustomer): number {
  const aTime = a.last_order_at ? new Date(a.last_order_at).getTime() : 0;
  const bTime = b.last_order_at ? new Date(b.last_order_at).getTime() : 0;
  return bTime - aTime;
}

export function selectAudience(
  customers: readonly SmsCustomer[],
  filter: AudienceFilter,
  context: AudienceContext
): AudienceResult {
  const now = new Date(context.now).getTime();
  const suppressed = new Set(context.suppressedPhones ?? []);
  const recentlyTexted = new Set(context.recentlyTextedPhones ?? []);

  const recipients: SmsCustomer[] = [];
  const excluded: AudienceExclusion[] = [];

  for (const customer of customers) {
    const veto = eligibilityVeto(customer, suppressed, recentlyTexted);
    if (veto) {
      excluded.push({ customerId: customer.id, reason: veto });
      continue;
    }
    if (!matchesFilter(customer, filter, now)) {
      excluded.push({ customerId: customer.id, reason: "filter" });
      continue;
    }
    recipients.push(customer);
  }

  const summary = ALL_REASONS.reduce(
    (counts, reason) => ({
      ...counts,
      [reason]: excluded.filter((entry) => entry.reason === reason).length,
    }),
    {} as Record<ExclusionReason, number>
  );

  // Sort a copy: the caller's list is React state on the customers screen.
  return { recipients: [...recipients].sort(byRecencyDesc), excluded, summary };
}
