/**
 * Every column the billing code reads must be in the query that fetches it.
 *
 * PostgREST returns only what was asked for, and a column the code reads but
 * the SELECT never names arrives as `undefined` — which every billing function
 * treats as "not set". For the anchor that means silently reverting to
 * pay-day billing; for `paid_through` it means opening the gate for the entire
 * platform at once.
 *
 * This platform has shipped that exact bug twice (branding mobile overrides,
 * multi-select modifier groups), both times because a new column was added to
 * the type and the code and not to the projection. A string assertion is a
 * crude test and it is the one that would have caught both.
 */

import { SUBSCRIPTION_SELECT } from '@/lib/billing/subscription-repository'

/** Every column any billing module reads off a `tenant_subscriptions` row. */
const COLUMNS_THE_CODE_READS = [
  'tenant_id',
  'status',
  'monthly_price_php',
  'paid_through',
  'grace_days',
  'billing_anchor_date',
] as const

describe('SUBSCRIPTION_SELECT', () => {
  it.each(COLUMNS_THE_CODE_READS)('projects %s', (column) => {
    const projected = SUBSCRIPTION_SELECT.split(',').map((part) => part.trim())

    expect(projected).toContain(column)
  })

  it('does not use a wildcard', () => {
    // The explicit list is the point: `*` would pass the assertions above by
    // accident and lose the compile-time pressure to keep this honest.
    expect(SUBSCRIPTION_SELECT).not.toContain('*')
  })
})
