/**
 * Which shop the web report answers for — and whether it may state a food cost.
 *
 * The merchant app settled this in `daily-report-revenue.ts`. The web had the
 * same hole and a worse version of it: the app at least WITHHELD a branch
 * manager's food cost, while the web quietly showed every branch admin the
 * whole chain's stock as though it were their own shelf.
 *
 * The decision is pulled out of the page because a server component cannot be
 * unit-tested, and this is the part that must not be got wrong: it decides
 * whether two halves of a ratio describe the same business.
 */

import { resolveReportScope } from '@/lib/inventory/report-scope'

describe('resolveReportScope — the branch the report covers', () => {
  test('an owner reads the whole store', () => {
    const scope = resolveReportScope({ scope: { kind: 'all' }, orderBackend: 'platform' })

    expect(scope.outletId).toBeNull()
  })

  test('a branch admin reads their own branch', () => {
    // Before this, a branch admin's inventory report reconciled every branch's
    // movements and presented the total as their day.
    const scope = resolveReportScope({
      scope: { kind: 'branch', outletId: 'north' },
      orderBackend: 'platform',
    })

    expect(scope.outletId).toBe('north')
  })
})

describe('resolveReportScope — whether a food cost may be stated', () => {
  test('a branch admin on a Supabase backend gets their takings', () => {
    // `getDailyRevenue` can narrow a Supabase `orders` read by `outlet_id`, so
    // both halves describe one branch.
    const scope = resolveReportScope({
      scope: { kind: 'branch', outletId: 'north' },
      orderBackend: 'supabase',
    })

    expect(scope.isRevenueBranchScoped).toBe(true)
  })

  test('a branch admin on Convex does not', () => {
    // The Convex `getDashboardStatsByPeriod` takes only a date window. Branch
    // stock over store-wide takings understates the food cost by roughly the
    // number of branches — and an understated food cost is the direction that
    // gets believed rather than investigated.
    const scope = resolveReportScope({
      scope: { kind: 'branch', outletId: 'north' },
      orderBackend: 'convex',
    })

    expect(scope.isRevenueBranchScoped).toBe(false)
  })

  test('an owner on Convex keeps their food cost', () => {
    // Nothing is being narrowed for a store-wide account, so there is no
    // mismatch to guard against. Withholding here would take the figure away
    // from the tenants who have had it all along.
    const scope = resolveReportScope({ scope: { kind: 'all' }, orderBackend: 'convex' })

    expect(scope.isRevenueBranchScoped).toBe(true)
  })

  test('a branch admin whose backend is unknown is treated as unnarrowable', () => {
    // Absent means "not established", never "assume yes" — the same rule the
    // merchant app's `isRevenueBranchScoped` follows.
    const scope = resolveReportScope({
      scope: { kind: 'branch', outletId: 'north' },
      orderBackend: null,
    })

    expect(scope.isRevenueBranchScoped).toBe(false)
  })
})
