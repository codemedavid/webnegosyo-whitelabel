/**
 * Copying the schedule into a store's own order database: upsert first, then
 * remove what the platform no longer has, so the trigger never sees an empty
 * table for a store that has a cutoff.
 */
import { writeCutoffsToTenantDb, type TenantCutoffDb } from '@/lib/business-day/tenant-db-sync'

const TENANT = '11111111-1111-4111-8111-111111111111'

function fakeDb(errors: { upsert?: string; delete?: string } = {}) {
  const calls: string[] = []
  const answer = (message?: string) => Promise.resolve({ error: message ? { message } : null })
  const db: TenantCutoffDb = {
    from: () => ({
      upsert: (rows, options) => {
        calls.push(`upsert ${JSON.stringify(rows)} ${options.onConflict}`)
        return answer(errors.upsert)
      },
      delete: () => ({
        eq: (column, value) => {
          calls.push(`delete ${column}=${value}`)
          return Object.assign(answer(errors.delete), {
            not: (notColumn: string, operator: string, list: string) => {
              calls.push(`  not ${notColumn} ${operator} ${list}`)
              return answer(errors.delete)
            },
          })
        },
      }),
    }),
  }
  return { db, calls }
}

describe('writeCutoffsToTenantDb', () => {
  it('upserts the schedule, then deletes only rows the platform no longer has', async () => {
    const { db, calls } = fakeDb()
    await writeCutoffsToTenantDb(db, TENANT, [
      { effectiveFrom: '2026-10-28', cutoffMinutes: 240 },
      { effectiveFrom: '2026-11-05', cutoffMinutes: 120 },
    ])
    expect(calls).toEqual([
      `upsert [{"tenant_id":"${TENANT}","effective_from":"2026-10-28","cutoff_minutes":240},{"tenant_id":"${TENANT}","effective_from":"2026-11-05","cutoff_minutes":120}] tenant_id,effective_from`,
      `delete tenant_id=${TENANT}`,
      '  not effective_from in (2026-10-28,2026-11-05)',
    ])
  })

  it("clears the store's rows when it has no cutoff (midnight)", async () => {
    const { db, calls } = fakeDb()
    await writeCutoffsToTenantDb(db, TENANT, [])
    expect(calls).toEqual([`delete tenant_id=${TENANT}`])
  })

  it('throws when the database refuses, so the deploy or sync reports it', async () => {
    await expect(writeCutoffsToTenantDb(fakeDb({ upsert: 'denied' }).db, TENANT, [{ effectiveFrom: '2026-10-28', cutoffMinutes: 240 }])).rejects.toThrow(/denied/)
    await expect(writeCutoffsToTenantDb(fakeDb({ delete: 'denied' }).db, TENANT, [])).rejects.toThrow(/denied/)
  })
})
