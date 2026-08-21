/**
 * Planning the cleanup of menu items the old sync duplicated.
 *
 * Choosing WHICH row survives is the whole risk here: thirteen tables hold a
 * foreign key to menu_items(id), so deleting the wrong row orphans order
 * history, bundles, upsell pairs, recipes and per-branch price overrides.
 *
 * The rule is therefore mechanical and conservative:
 *  - the keeper is the row that already carries loyverse_item_id (migration
 *    20260828120000 assigned it to the earliest-created row of each group);
 *  - failing that, the earliest-created row;
 *  - a group with no duplicates is not a plan item at all.
 *
 * Deciding whether a duplicate is SAFE to delete is a separate, data-driven
 * step in the script (reference counting); this module only nominates.
 */

import { planLoyverseDedupe } from '@/lib/loyverse/dedupe-plan'

const row = (
  id: string,
  name: string,
  createdAt: string,
  loyverseItemId: string | null = null
) => ({
  id,
  tenant_id: 't1',
  name,
  category_id: 'c1',
  loyverse_item_id: loyverseItemId,
  created_at: createdAt,
})

describe('planLoyverseDedupe', () => {
  it('keeps the row that already carries the Loyverse identity', () => {
    const plan = planLoyverseDedupe([
      row('b', 'Americano', '2026-01-02T00:00:00Z'),
      row('a', 'Americano', '2026-01-01T00:00:00Z', 'item_1'),
    ])

    expect(plan).toEqual([
      { tenantId: 't1', name: 'Americano', keeperId: 'a', duplicateIds: ['b'] },
    ])
  })

  it('falls back to the earliest-created row when none carries an identity', () => {
    const plan = planLoyverseDedupe([
      row('b', 'Latte', '2026-01-05T00:00:00Z'),
      row('a', 'Latte', '2026-01-01T00:00:00Z'),
    ])

    expect(plan[0].keeperId).toBe('a')
    expect(plan[0].duplicateIds).toEqual(['b'])
  })

  it('does not report a group that has no duplicates', () => {
    expect(planLoyverseDedupe([row('a', 'Americano', '2026-01-01T00:00:00Z', 'item_1')])).toEqual([])
  })

  it('never groups across tenants', () => {
    const plan = planLoyverseDedupe([
      { ...row('a', 'Americano', '2026-01-01T00:00:00Z'), tenant_id: 't1' },
      { ...row('b', 'Americano', '2026-01-02T00:00:00Z'), tenant_id: 't2' },
    ])

    expect(plan).toEqual([])
  })

  it('never groups across categories', () => {
    // Same name in two categories is a legitimate menu, not a duplicate.
    const plan = planLoyverseDedupe([
      { ...row('a', 'Water', '2026-01-01T00:00:00Z'), category_id: 'drinks' },
      { ...row('b', 'Water', '2026-01-02T00:00:00Z'), category_id: 'addons' },
    ])

    expect(plan).toEqual([])
  })

  it('never nominates two rows that both carry an identity', () => {
    // Distinct Loyverse items that happen to share a name are NOT duplicates;
    // the partial unique index proves they are separate products.
    const plan = planLoyverseDedupe([
      row('a', 'Combo', '2026-01-01T00:00:00Z', 'item_1'),
      row('b', 'Combo', '2026-01-02T00:00:00Z', 'item_2'),
    ])

    expect(plan).toEqual([])
  })

  it('lists every duplicate when a group has more than two rows', () => {
    const plan = planLoyverseDedupe([
      row('c', 'Mocha', '2026-01-03T00:00:00Z'),
      row('a', 'Mocha', '2026-01-01T00:00:00Z', 'item_9'),
      row('b', 'Mocha', '2026-01-02T00:00:00Z'),
    ])

    expect(plan[0].keeperId).toBe('a')
    expect(plan[0].duplicateIds.sort()).toEqual(['b', 'c'])
  })

  it('matches names case- and whitespace-insensitively', () => {
    const plan = planLoyverseDedupe([
      row('a', 'Cold Brew', '2026-01-01T00:00:00Z', 'item_1'),
      row('b', '  cold brew ', '2026-01-02T00:00:00Z'),
    ])

    expect(plan[0].duplicateIds).toEqual(['b'])
  })
})
