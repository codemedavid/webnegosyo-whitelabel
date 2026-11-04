/**
 * Named shifts ("service periods", CONTRACTS §1.8, §2): validation, the list
 * read, and writes that ASSERT affected rows, because an RLS refusal is a
 * silent zero-row answer, never an error.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  SERVICE_PERIOD_NAME_TAKEN,
  SERVICE_PERIOD_NOT_SAVED,
  archiveServicePeriod,
  createServicePeriod,
  formatPeriodTimes,
  listServicePeriods,
  periodsForBranch,
  servicePeriodInputSchema,
  updateServicePeriod,
  type ServicePeriod,
} from '@/lib/cash/service-periods'
import { fakeSupabaseTables } from '../../fixtures/fake-supabase-tables'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const OUTLET_A = '33333333-3333-4333-8333-333333333333'
const OUTLET_B = '44444444-4444-4444-8444-444444444444'
const PERIOD_ID = '55555555-5555-4555-8555-555555555555'

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: PERIOD_ID,
    tenant_id: TENANT_ID,
    outlet_id: null,
    name: 'Day shift',
    starts_minutes: 720,
    ends_minutes: 1200,
    sort: 0,
    archived_at: null,
    ...overrides,
  }
}

/** A write double: records the chain and answers with the given rows. */
function writeDb(answer: { data: unknown; error: { code?: string; message: string } | null }) {
  const chain: Array<[string, ...unknown[]]> = []
  const builder: Record<string, unknown> = {}
  for (const method of ['insert', 'update', 'eq', 'is', 'select']) {
    builder[method] = (...args: unknown[]) => {
      chain.push([method, ...args])
      return builder
    }
  }
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(answer).then(resolve, reject)
  const db = {
    from: (table: string) => {
      chain.push(['from', table])
      return builder
    },
  } as unknown as SupabaseClient
  return { db, chain }
}

describe('servicePeriodInputSchema', () => {
  it('trims the name and accepts an overnight period (ends before it starts)', () => {
    const parsed = servicePeriodInputSchema.parse({ name: '  Night shift ', startsMinutes: 1200, endsMinutes: 120, outletId: null })

    expect(parsed).toEqual({ name: 'Night shift', startsMinutes: 1200, endsMinutes: 120, outletId: null })
  })

  it('refuses a blank name or one longer than 40 characters', () => {
    expect(servicePeriodInputSchema.safeParse({ name: '   ', startsMinutes: 0, endsMinutes: 60, outletId: null }).success).toBe(false)
    expect(servicePeriodInputSchema.safeParse({ name: 'x'.repeat(41), startsMinutes: 0, endsMinutes: 60, outletId: null }).success).toBe(false)
  })

  it('refuses times outside a day and non-whole minutes', () => {
    expect(servicePeriodInputSchema.safeParse({ name: 'A', startsMinutes: 1440, endsMinutes: 60, outletId: null }).success).toBe(false)
    expect(servicePeriodInputSchema.safeParse({ name: 'A', startsMinutes: -1, endsMinutes: 60, outletId: null }).success).toBe(false)
    expect(servicePeriodInputSchema.safeParse({ name: 'A', startsMinutes: 10.5, endsMinutes: 60, outletId: null }).success).toBe(false)
  })

  it('refuses a branch that is not an id', () => {
    expect(servicePeriodInputSchema.safeParse({ name: 'A', startsMinutes: 0, endsMinutes: 60, outletId: 'main' }).success).toBe(false)
  })
})

describe('listServicePeriods', () => {
  it('reads the store’s periods in their order, archived ones left out', async () => {
    const { client } = fakeSupabaseTables({
      service_periods: [
        row({ id: 'b', name: 'Night shift', starts_minutes: 1200, ends_minutes: 120, sort: 1 }),
        row({ id: 'a', sort: 0 }),
        row({ id: 'gone', sort: 2, archived_at: '2026-10-20T00:00:00.000Z' }),
        row({ id: 'other-store', tenant_id: 'someone-else' }),
      ],
    })

    const periods = await listServicePeriods(client, TENANT_ID)

    expect(periods.map((period) => period.id)).toEqual(['a', 'b'])
    expect(periods[1]).toEqual({
      id: 'b',
      outletId: null,
      name: 'Night shift',
      startsMinutes: 1200,
      endsMinutes: 120,
      sort: 1,
      archivedAt: null,
    })
  })

  it('throws (never an empty list) when the read fails', async () => {
    const { client } = fakeSupabaseTables({}, { service_periods: 'boom' })

    await expect(listServicePeriods(client, TENANT_ID)).rejects.toThrow()
  })
})

describe('periodsForBranch', () => {
  const periods: ServicePeriod[] = [
    { id: 'all', outletId: null, name: 'Day', startsMinutes: 600, endsMinutes: 1080, sort: 0, archivedAt: null },
    { id: 'a', outletId: OUTLET_A, name: 'Late', startsMinutes: 1080, endsMinutes: 120, sort: 1, archivedAt: null },
    { id: 'b', outletId: OUTLET_B, name: 'Brunch', startsMinutes: 480, endsMinutes: 720, sort: 2, archivedAt: null },
  ]

  it('gives a branch the every-branch periods plus its own', () => {
    expect(periodsForBranch(periods, OUTLET_A).map((period) => period.id)).toEqual(['all', 'a'])
  })

  it('gives the whole store only the every-branch periods', () => {
    expect(periodsForBranch(periods, null).map((period) => period.id)).toEqual(['all'])
  })
})

describe('formatPeriodTimes', () => {
  it('reads like the clock-in picker: "12 PM–8 PM", "8 PM–2 AM", "6:30 AM–2 PM"', () => {
    expect(formatPeriodTimes({ startsMinutes: 720, endsMinutes: 1200 })).toBe('12 PM–8 PM')
    expect(formatPeriodTimes({ startsMinutes: 1200, endsMinutes: 120 })).toBe('8 PM–2 AM')
    expect(formatPeriodTimes({ startsMinutes: 390, endsMinutes: 840 })).toBe('6:30 AM–2 PM')
    expect(formatPeriodTimes({ startsMinutes: 0, endsMinutes: 0 })).toBe('12 AM–12 AM')
  })
})

describe('createServicePeriod', () => {
  it('inserts for the store and returns the saved row', async () => {
    const { db, chain } = writeDb({ data: [row()], error: null })

    const saved = await createServicePeriod(db, TENANT_ID, { name: 'Day shift', startsMinutes: 720, endsMinutes: 1200, outletId: null }, 0)

    expect(chain[0]).toEqual(['from', 'service_periods'])
    expect(chain[1]).toEqual([
      'insert',
      { tenant_id: TENANT_ID, outlet_id: null, name: 'Day shift', starts_minutes: 720, ends_minutes: 1200, sort: 0 },
    ])
    expect(saved.name).toBe('Day shift')
  })

  it('throws "not saved" when the insert comes back with no row (RLS refused it)', async () => {
    const { db } = writeDb({ data: [], error: null })

    await expect(
      createServicePeriod(db, TENANT_ID, { name: 'Day shift', startsMinutes: 720, endsMinutes: 1200, outletId: null }, 0),
    ).rejects.toThrow(SERVICE_PERIOD_NOT_SAVED)
  })
})

describe('a name already in use', () => {
  it('says so in plain words (the live-name unique index)', async () => {
    const { db } = writeDb({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } })

    await expect(
      createServicePeriod(db, TENANT_ID, { name: 'Day shift', startsMinutes: 720, endsMinutes: 1200, outletId: null }, 0),
    ).rejects.toThrow(SERVICE_PERIOD_NAME_TAKEN)
  })
})

describe('updateServicePeriod', () => {
  it('updates only a live period of this store and asserts one row changed', async () => {
    const { db, chain } = writeDb({ data: [row({ name: 'Lunch' })], error: null })

    const saved = await updateServicePeriod(db, TENANT_ID, PERIOD_ID, { name: 'Lunch', startsMinutes: 720, endsMinutes: 1200, outletId: null })

    expect(chain).toEqual(
      expect.arrayContaining([
        ['eq', 'tenant_id', TENANT_ID],
        ['eq', 'id', PERIOD_ID],
        ['is', 'archived_at', null],
      ]),
    )
    expect(saved.name).toBe('Lunch')
  })

  it('throws "not saved" on zero rows', async () => {
    const { db } = writeDb({ data: [], error: null })

    await expect(
      updateServicePeriod(db, TENANT_ID, PERIOD_ID, { name: 'Lunch', startsMinutes: 720, endsMinutes: 1200, outletId: null }),
    ).rejects.toThrow(SERVICE_PERIOD_NOT_SAVED)
  })
})

describe('archiveServicePeriod', () => {
  it('stamps archived_at (never deletes) and asserts one row changed', async () => {
    const { db, chain } = writeDb({ data: [row({ archived_at: '2026-10-27T00:00:00.000Z' })], error: null })

    await archiveServicePeriod(db, TENANT_ID, PERIOD_ID)

    const update = chain.find(([method]) => method === 'update')
    expect(update?.[1]).toEqual({ archived_at: expect.any(String) })
    expect(chain.some(([method]) => method === 'delete')).toBe(false)
  })

  it('throws "not saved" on zero rows', async () => {
    const { db } = writeDb({ data: [], error: null })

    await expect(archiveServicePeriod(db, TENANT_ID, PERIOD_ID)).rejects.toThrow(SERVICE_PERIOD_NOT_SAVED)
  })

  it('surfaces a database error as an error, not a success', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const { db } = writeDb({ data: null, error: { code: '42501', message: 'new row violates row-level security' } })

    await expect(archiveServicePeriod(db, TENANT_ID, PERIOD_ID)).rejects.toThrow()
    errorSpy.mockRestore()
  })
})
