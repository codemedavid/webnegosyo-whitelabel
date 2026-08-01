import { describe, it, expect, beforeEach } from '@jest/globals'
import {
  OUTLET_MENU_OVERRIDE_SELECT,
  OutletMenuValidationError,
  type OutletMenuOverridePatch,
  type OutletMenuRepository,
} from '@/lib/outlets/outlet-menu-repository'
import { createInMemoryOutletMenuRepository } from '@/lib/outlets/in-memory-outlet-menu-repository'
import type { OutletMenuOverride } from '@/types/database'

/**
 * The behavioural contract every `OutletMenuRepository` must satisfy, expressed
 * once and runnable against any implementation — the arrangement
 * `outlets-repository-contract.test.ts` established.
 *
 * The contract's centre of gravity is that this is an OVERRIDE store: writing
 * a branch back to the store-wide values must leave no row behind, because a
 * row that overrides nothing is indistinguishable from a merchant decision the
 * owner's cross-branch views would then report as one.
 */
export function describeOutletMenuRepositoryContract(
  name: string,
  makeRepository: () => OutletMenuRepository
) {
  describe(`OutletMenuRepository contract — ${name}`, () => {
    const TENANT = 'tenant-1'
    const OTHER_TENANT = 'tenant-2'
    const BRANCH_A = 'branch-a'
    const BRANCH_B = 'branch-b'
    const ITEM = 'item-1'

    let repo: OutletMenuRepository

    beforeEach(() => {
      repo = makeRepository()
    })

    const save = (patch: OutletMenuOverridePatch, outletId = BRANCH_A, itemId = ITEM) =>
      repo.save(TENANT, outletId, itemId, patch)

    describe('reading when nothing has been overridden', () => {
      it('returns no rows for a tenant that never touched a branch menu', async () => {
        expect(await repo.listByTenant(TENANT)).toEqual([])
        expect(await repo.listByOutlet(TENANT, BRANCH_A)).toEqual([])
        expect(await repo.listByMenuItem(TENANT, ITEM)).toEqual([])
      })
    })

    describe('save', () => {
      it('records a branch price', async () => {
        const saved = await save({ price: 210 })

        expect(saved?.price).toBe(210)
        expect(saved?.outlet_id).toBe(BRANCH_A)
        expect(saved?.menu_item_id).toBe(ITEM)
        expect(saved?.tenant_id).toBe(TENANT)
      })

      it('defaults an untouched flag to the store-wide behaviour', async () => {
        const saved = await save({ price: 210 })

        expect(saved?.is_listed).toBe(true)
        expect(saved?.is_available).toBe(true)
        expect(saved?.discounted_price).toBeNull()
        expect(saved?.discount_cleared).toBe(false)
      })

      it('updates the existing row rather than adding a second one', async () => {
        await save({ price: 210 })
        await save({ is_available: false })

        const rows = await repo.listByOutlet(TENANT, BRANCH_A)
        expect(rows).toHaveLength(1)
        expect(rows[0].price).toBe(210)
        expect(rows[0].is_available).toBe(false)
      })

      it('leaves fields the patch does not mention alone', async () => {
        await save({ price: 210, is_listed: false })
        const saved = await save({ is_available: false })

        expect(saved?.price).toBe(210)
        expect(saved?.is_listed).toBe(false)
      })

      it('keeps branches independent', async () => {
        await save({ price: 210 }, BRANCH_A)
        await save({ price: 195 }, BRANCH_B)

        expect((await repo.listByOutlet(TENANT, BRANCH_A))[0].price).toBe(210)
        expect((await repo.listByOutlet(TENANT, BRANCH_B))[0].price).toBe(195)
      })

      it('accepts a free item at one branch', async () => {
        expect((await save({ price: 0 }))?.price).toBe(0)
      })
    })

    describe('save — returning to the store-wide menu', () => {
      it('removes the row when every override is cleared', async () => {
        await save({ price: 210 })

        const result = await save({ price: null })

        // Null, not a row of defaults: "this branch has no opinion" is the
        // absence of a row, and a row of defaults would show up in the owner's
        // views as a decision somebody made.
        expect(result).toBeNull()
        expect(await repo.listByOutlet(TENANT, BRANCH_A)).toEqual([])
      })

      it('keeps the row when one override remains', async () => {
        await save({ price: 210, is_listed: false })

        const result = await save({ price: null })

        expect(result).not.toBeNull()
        expect(result?.is_listed).toBe(false)
      })

      it('writes nothing at all for a patch that overrides nothing', async () => {
        const result = await save({ is_listed: true, is_available: true })

        expect(result).toBeNull()
        expect(await repo.listByTenant(TENANT)).toEqual([])
      })
    })

    describe('clear', () => {
      it('returns a branch to the store-wide menu', async () => {
        await save({ price: 210, is_listed: false })

        await repo.clear(TENANT, BRANCH_A, ITEM)

        expect(await repo.listByOutlet(TENANT, BRANCH_A)).toEqual([])
      })

      it('is silent when there was nothing to clear', async () => {
        await expect(repo.clear(TENANT, BRANCH_A, ITEM)).resolves.toBeUndefined()
      })

      it('leaves other branches alone', async () => {
        await save({ price: 210 }, BRANCH_A)
        await save({ price: 195 }, BRANCH_B)

        await repo.clear(TENANT, BRANCH_A, ITEM)

        expect(await repo.listByOutlet(TENANT, BRANCH_B)).toHaveLength(1)
      })
    })

    describe('tenant isolation', () => {
      it('never returns another tenant\'s overrides', async () => {
        await repo.save(OTHER_TENANT, BRANCH_A, ITEM, { price: 999 })

        expect(await repo.listByTenant(TENANT)).toEqual([])
        expect(await repo.listByOutlet(TENANT, BRANCH_A)).toEqual([])
        expect(await repo.listByMenuItem(TENANT, ITEM)).toEqual([])
      })

      it('will not clear another tenant\'s override', async () => {
        await repo.save(OTHER_TENANT, BRANCH_A, ITEM, { price: 999 })

        await repo.clear(TENANT, BRANCH_A, ITEM)

        expect(await repo.listByTenant(OTHER_TENANT)).toHaveLength(1)
      })
    })

    describe('listByMenuItem — the item\'s Branches tab', () => {
      it('returns one dish across every branch that has an opinion', async () => {
        await save({ price: 210 }, BRANCH_A)
        await save({ is_listed: false }, BRANCH_B)
        await save({ price: 50 }, BRANCH_A, 'item-2')

        const rows = await repo.listByMenuItem(TENANT, ITEM)

        expect(rows.map((r) => r.outlet_id).sort()).toEqual([BRANCH_A, BRANCH_B])
      })
    })

    describe('validation', () => {
      it('rejects a negative price', async () => {
        await expect(save({ price: -1 })).rejects.toThrow(OutletMenuValidationError)
      })

      it('rejects a negative discount', async () => {
        await expect(save({ discounted_price: -1 })).rejects.toThrow(OutletMenuValidationError)
      })

      it('rejects a price that is not a number', async () => {
        await expect(save({ price: Number.NaN })).rejects.toThrow(OutletMenuValidationError)
      })

      it('rejects clearing and setting a discount at once', async () => {
        // Contradictory instructions: whichever the reader honoured would
        // surprise the other half of the app. Mirrors the DB check constraint.
        await expect(save({ discount_cleared: true, discounted_price: 120 })).rejects.toThrow(
          OutletMenuValidationError
        )
      })

      it('rejects a discount above the branch price', async () => {
        await expect(save({ price: 100, discounted_price: 150 })).rejects.toThrow(
          OutletMenuValidationError
        )
      })

      it('explains itself in words a merchant can act on', async () => {
        await expect(save({ price: -1 })).rejects.toThrow(/zero or more/i)
      })
    })
  })
}

describeOutletMenuRepositoryContract('in-memory', createInMemoryOutletMenuRepository)

describe('OUTLET_MENU_OVERRIDE_SELECT', () => {
  it('selects every column the OutletMenuOverride type declares', () => {
    // A column the app reads but the query never selects resolves to
    // `undefined` at runtime and silently falls back to a default. That has
    // killed two shipped features in this codebase; the projection is asserted
    // rather than trusted.
    const selected = OUTLET_MENU_OVERRIDE_SELECT.split(',').map((c) => c.trim()).filter(Boolean)

    const required: Array<keyof OutletMenuOverride> = [
      'id',
      'tenant_id',
      'outlet_id',
      'menu_item_id',
      'is_listed',
      'is_available',
      'price',
      'discounted_price',
      'discount_cleared',
      'created_at',
      'updated_at',
    ]

    expect(selected.sort()).toEqual([...required].sort())
  })
})
