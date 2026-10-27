/**
 * The schedule as it travels to a Convex deployment's `tenantConfig`.
 */
import { BUSINESS_DAY_CUTOFFS_CONFIG_KEY as WEB_KEY, businessDayConfigEntry, readBusinessDayConfigEntry } from '@/lib/business-day/convex-config'
import { BUSINESS_DAY_CUTOFFS_CONFIG_KEY as CONVEX_KEY, parseCutoffConfig } from '../../../convex-template/convex/time'

const TENANT = '11111111-1111-4111-8111-111111111111'
const FOUR_AM = [{ effectiveFrom: '2026-10-28', cutoffMinutes: 240 }]

function dbAnswering(answer: { data: unknown; error: { code?: string; message: string } | null }) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => Promise.resolve(answer),
  }
  return { from: () => builder }
}

describe('business_day_cutoffs config row', () => {
  it('uses the key the deployment reads', () => {
    expect(WEB_KEY).toBe(CONVEX_KEY)
  })

  it('is read back by the deployment as the same schedule', () => {
    const entry = businessDayConfigEntry(FOUR_AM)
    expect(parseCutoffConfig(entry[WEB_KEY])).toEqual(FOUR_AM)
  })

  it('says midnight explicitly for a store with no cutoff', () => {
    expect(businessDayConfigEntry([])).toEqual({ [WEB_KEY]: '[]' })
  })

  it('reads the store schedule for the sync', async () => {
    const db = dbAnswering({ data: [{ effective_from: '2026-10-28', cutoff_minutes: 240 }], error: null })
    await expect(readBusinessDayConfigEntry(db, TENANT)).resolves.toEqual({ [WEB_KEY]: JSON.stringify(FOUR_AM) })
  })

  it('fails the sync rather than push midnight over a schedule it could not read', async () => {
    const db = dbAnswering({ data: null, error: { code: '57014', message: 'timeout' } })
    await expect(readBusinessDayConfigEntry(db, TENANT)).rejects.toThrow()
  })
})
