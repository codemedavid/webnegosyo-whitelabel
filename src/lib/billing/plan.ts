/**
 * The platform's subscription terms.
 *
 * One plan, one price. There is no plans table because there is no second plan:
 * a table would be an empty abstraction over a single row, and the price is
 * already stored per subscription (`monthly_price_php`) so an individual client
 * can be given a different number without any schema change. When a real second
 * tier exists, that is the moment to introduce plans — not before.
 */

/** Standard monthly price, in Philippine pesos. */
export const MONTHLY_PRICE_PHP = 649

/** Billing period length. Everything here is monthly; this names the assumption. */
export const BILLING_PERIOD_MONTHS = 1

/**
 * Default seat allowance per branch, matching the cap that was hard-coded
 * before subscriptions existed. Existing stores must not notice this change.
 */
export const DEFAULT_MAX_STAFF_PER_BRANCH = 3

/**
 * Default branch allowance.
 *
 * One, because a store that has never asked for branches has exactly one place.
 * The migration backfills every existing tenant with its ACTUAL branch count, so
 * this default only ever applies to a tenant created from here on.
 */
export const DEFAULT_MAX_OUTLETS = 1
