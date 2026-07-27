import { describe, it, expect, beforeEach } from '@jest/globals'
import {
  OUTLET_SELECT,
  type Outlet,
  type OutletRepository,
  type OutletWriteInput,
} from '@/lib/outlets/outlet-repository'
import { createInMemoryOutletRepository } from '@/lib/outlets/in-memory-outlet-repository'

/**
 * The behavioural contract every `OutletRepository` must satisfy, expressed once
 * and runnable against any implementation. Today only the in-memory repository
 * is exercised here (the Supabase one needs a live database — see the projection
 * test at the bottom and the manual QA checklist); keeping the suite as a
 * factory is what makes adding a second backend a drop-in rather than a rewrite.
 */
export function describeOutletRepositoryContract(
  name: string,
  makeRepository: () => OutletRepository
) {
  describe(`OutletRepository contract — ${name}`, () => {
    const TENANT = 'tenant-1'
    const OTHER_TENANT = 'tenant-2'
    let repo: OutletRepository

    const input = (overrides: Partial<OutletWriteInput> = {}): OutletWriteInput => ({
      name: 'BGC High Street',
      slug: 'bgc',
      address: '9th Ave, Taguig',
      latitude: 14.5507,
      longitude: 121.047,
      phone: null,
      operating_hours: null,
      timezone: null,
      supports_pickup: true,
      supports_delivery: true,
      delivery_radius_km: null,
      is_active: true,
      sort_order: 0,
      ...overrides,
    })

    beforeEach(() => {
      repo = makeRepository()
    })

    describe('listByTenant', () => {
      it('returns an empty list for a tenant with no outlets', async () => {
        expect(await repo.listByTenant(TENANT)).toEqual([])
      })

      it('returns outlets ordered by sort_order, then name', async () => {
        await repo.create(TENANT, input({ slug: 'cubao', name: 'Cubao', sort_order: 2 }))
        await repo.create(TENANT, input({ slug: 'alabang', name: 'Alabang', sort_order: 1 }))
        await repo.create(TENANT, input({ slug: 'bgc', name: 'BGC', sort_order: 1 }))

        const slugs = (await repo.listByTenant(TENANT)).map((outlet) => outlet.slug)
        expect(slugs).toEqual(['alabang', 'bgc', 'cubao'])
      })

      it('includes inactive outlets so admin can see and reactivate them', async () => {
        await repo.create(TENANT, input({ slug: 'closed', is_active: false }))
        expect(await repo.listByTenant(TENANT)).toHaveLength(1)
      })

      it('never leaks another tenant’s outlets', async () => {
        await repo.create(OTHER_TENANT, input({ slug: 'theirs' }))
        expect(await repo.listByTenant(TENANT)).toEqual([])
      })
    })

    describe('listActiveByTenant', () => {
      it('excludes inactive outlets', async () => {
        await repo.create(TENANT, input({ slug: 'open' }))
        await repo.create(TENANT, input({ slug: 'closed', is_active: false }))

        const slugs = (await repo.listActiveByTenant(TENANT)).map((outlet) => outlet.slug)
        expect(slugs).toEqual(['open'])
      })
    })

    describe('findBySlug', () => {
      it('finds an outlet by its slug within the tenant', async () => {
        await repo.create(TENANT, input({ slug: 'bgc' }))
        expect((await repo.findBySlug(TENANT, 'bgc'))?.slug).toBe('bgc')
      })

      it('matches case-insensitively, since slugs arrive from URLs', async () => {
        await repo.create(TENANT, input({ slug: 'bgc' }))
        expect((await repo.findBySlug(TENANT, 'BGC'))?.slug).toBe('bgc')
      })

      it('returns null for an unknown slug rather than throwing', async () => {
        expect(await repo.findBySlug(TENANT, 'nope')).toBeNull()
      })

      it('returns null for a slug belonging to another tenant', async () => {
        await repo.create(OTHER_TENANT, input({ slug: 'theirs' }))
        expect(await repo.findBySlug(TENANT, 'theirs')).toBeNull()
      })

      it('finds inactive outlets, so callers can detect deactivation explicitly', async () => {
        await repo.create(TENANT, input({ slug: 'closed', is_active: false }))
        const found = await repo.findBySlug(TENANT, 'closed')
        expect(found?.is_active).toBe(false)
      })
    })

    describe('findById', () => {
      it('round-trips a created outlet', async () => {
        const created = await repo.create(TENANT, input())
        expect((await repo.findById(TENANT, created.id))?.id).toBe(created.id)
      })

      it('returns null across tenants', async () => {
        const created = await repo.create(OTHER_TENANT, input())
        expect(await repo.findById(TENANT, created.id)).toBeNull()
      })
    })

    describe('create', () => {
      it('returns the stored row with an id and timestamps', async () => {
        const created = await repo.create(TENANT, input())
        expect(created.id).toEqual(expect.any(String))
        expect(created.tenant_id).toBe(TENANT)
        expect(created.created_at).toEqual(expect.any(String))
        expect(created.updated_at).toEqual(expect.any(String))
      })

      it('rejects a slug already used by the same tenant', async () => {
        await repo.create(TENANT, input({ slug: 'bgc' }))
        await expect(repo.create(TENANT, input({ slug: 'bgc' }))).rejects.toThrow(/already/i)
      })

      it('rejects a duplicate slug differing only in case', async () => {
        await repo.create(TENANT, input({ slug: 'bgc' }))
        await expect(repo.create(TENANT, input({ slug: 'BGC' }))).rejects.toThrow(/already/i)
      })

      it('allows the same slug under a different tenant', async () => {
        await repo.create(TENANT, input({ slug: 'bgc' }))
        await expect(repo.create(OTHER_TENANT, input({ slug: 'bgc' }))).resolves.toBeTruthy()
      })

      it('rejects a reserved slug', async () => {
        await expect(repo.create(TENANT, input({ slug: 'menu' }))).rejects.toThrow(/reserved/i)
      })

      it('rejects a malformed slug', async () => {
        await expect(repo.create(TENANT, input({ slug: 'bgc street' }))).rejects.toThrow(
          /letters, numbers/i
        )
      })

      it('normalizes the slug it stores', async () => {
        const created = await repo.create(TENANT, input({ slug: '  BGC  ' }))
        expect(created.slug).toBe('bgc')
      })

      it('rejects a blank name', async () => {
        await expect(repo.create(TENANT, input({ name: '   ' }))).rejects.toThrow(/name/i)
      })

      it('rejects an outlet that supports neither pickup nor delivery', async () => {
        await expect(
          repo.create(TENANT, input({ supports_pickup: false, supports_delivery: false }))
        ).rejects.toThrow(/pickup or delivery/i)
      })

      it('rejects out-of-range coordinates', async () => {
        await expect(repo.create(TENANT, input({ latitude: 99 }))).rejects.toThrow(/latitude/i)
        await expect(repo.create(TENANT, input({ longitude: 200 }))).rejects.toThrow(/longitude/i)
      })

      it('accepts an outlet with no coordinates at all', async () => {
        const created = await repo.create(TENANT, input({ latitude: null, longitude: null }))
        expect(created.latitude).toBeNull()
      })

      it('rejects a half-specified coordinate pair', async () => {
        await expect(repo.create(TENANT, input({ longitude: null }))).rejects.toThrow(
          /both latitude and longitude/i
        )
      })
    })

    describe('update', () => {
      let existing: Outlet

      beforeEach(async () => {
        existing = await repo.create(TENANT, input({ slug: 'bgc' }))
      })

      it('applies a partial patch and leaves other fields untouched', async () => {
        const updated = await repo.update(TENANT, existing.id, { name: 'BGC Central' })
        expect(updated.name).toBe('BGC Central')
        expect(updated.slug).toBe('bgc')
      })

      it('advances updated_at', async () => {
        const updated = await repo.update(TENANT, existing.id, { name: 'BGC Central' })
        expect(Date.parse(updated.updated_at)).toBeGreaterThanOrEqual(Date.parse(existing.updated_at))
      })

      it('keeps the original creation timestamp', async () => {
        const updated = await repo.update(TENANT, existing.id, { name: 'BGC Central' })
        expect(updated.created_at).toBe(existing.created_at)
      })

      it('validates a changed slug against the reserved list', async () => {
        await expect(repo.update(TENANT, existing.id, { slug: 'checkout' })).rejects.toThrow(
          /reserved/i
        )
      })

      it('rejects a slug already taken by a sibling outlet', async () => {
        await repo.create(TENANT, input({ slug: 'qc' }))
        await expect(repo.update(TENANT, existing.id, { slug: 'qc' })).rejects.toThrow(/already/i)
      })

      it('allows an outlet to keep its own slug', async () => {
        await expect(repo.update(TENANT, existing.id, { slug: 'bgc' })).resolves.toBeTruthy()
      })

      it('refuses to update another tenant’s outlet', async () => {
        await expect(repo.update(OTHER_TENANT, existing.id, { name: 'Hijack' })).rejects.toThrow(
          /not found/i
        )
      })

      it('deactivates without deleting', async () => {
        const updated = await repo.update(TENANT, existing.id, { is_active: false })
        expect(updated.is_active).toBe(false)
        expect(await repo.findById(TENANT, existing.id)).not.toBeNull()
      })
    })

    describe('reorder', () => {
      it('assigns sort_order to match the given id sequence', async () => {
        const a = await repo.create(TENANT, input({ slug: 'aa', sort_order: 0 }))
        const b = await repo.create(TENANT, input({ slug: 'bb', sort_order: 1 }))
        const c = await repo.create(TENANT, input({ slug: 'cc', sort_order: 2 }))

        await repo.reorder(TENANT, [c.id, a.id, b.id])

        const slugs = (await repo.listByTenant(TENANT)).map((outlet) => outlet.slug)
        expect(slugs).toEqual(['cc', 'aa', 'bb'])
      })

      it('ignores ids belonging to another tenant instead of moving them', async () => {
        const mine = await repo.create(TENANT, input({ slug: 'mine' }))
        const theirs = await repo.create(OTHER_TENANT, input({ slug: 'theirs', sort_order: 7 }))

        await repo.reorder(TENANT, [theirs.id, mine.id])

        expect((await repo.findById(OTHER_TENANT, theirs.id))?.sort_order).toBe(7)
      })
    })
  })
}

describeOutletRepositoryContract('in-memory', createInMemoryOutletRepository)

describe('OUTLET_SELECT projection', () => {
  // Same guard the storefront tenant projection carries: a column that the app
  // reads but the query never selects resolves to undefined at runtime, which
  // has silently broken features in this codebase before.
  const required = [
    'id',
    'tenant_id',
    'name',
    'slug',
    'address',
    'latitude',
    'longitude',
    'phone',
    'operating_hours',
    'timezone',
    'supports_pickup',
    'supports_delivery',
    'delivery_radius_km',
    'is_active',
    'sort_order',
    'created_at',
    'updated_at',
  ]

  const selected = OUTLET_SELECT.split(',').map((column) => column.trim())

  it.each(required)('selects the %s column', (column) => {
    expect(selected).toContain(column)
  })

  it('selects nothing beyond the known columns', () => {
    expect(selected.filter(Boolean).sort()).toEqual([...required].sort())
  })
})
