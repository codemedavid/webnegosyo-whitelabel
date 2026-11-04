/**
 * Reading a store's business-day cutoffs through the caller's session client.
 *
 * Two modes: writers and freezers (day close, cash screens) FAIL CLOSED, because
 * filing money under the wrong day is worse than refusing; displays fall back to
 * midnight and say so (`isFallback`), because a report should still open.
 */
import {
  CUTOFF_ROW_LIMIT,
  readCutoffSchedule,
  readCutoffScheduleForDisplay,
} from '@/lib/business-day/read-schedule'
import { MIDNIGHT_SCHEDULE } from '@/lib/business-day/trading-day'

const TENANT = '11111111-1111-4111-8111-111111111111'

interface Answer {
  data: unknown
  error: { code?: string; message: string } | null
}

function fakeDb(answer: Answer | Error) {
  const calls: Record<string, unknown[]> = {}
  const record = (name: string, ...args: unknown[]) => {
    calls[name] = args
  }
  const builder = {
    select: (...args: unknown[]) => (record('select', ...args), builder),
    eq: (...args: unknown[]) => (record('eq', ...args), builder),
    order: (...args: unknown[]) => (record('order', ...args), builder),
    limit: (...args: unknown[]) => {
      record('limit', ...args)
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer)
    },
  }
  const db = {
    from: (table: string) => {
      record('from', table)
      return builder
    },
  }
  return { db, calls }
}

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  ;(console.error as jest.Mock).mockRestore()
})

describe('readCutoffSchedule (writers: fail closed)', () => {
  it('reads one tenant, oldest first, bounded', async () => {
    const { db, calls } = fakeDb({ data: [{ effective_from: '2026-10-28', cutoff_minutes: 240 }], error: null })

    const schedule = await readCutoffSchedule(db, TENANT)

    expect(schedule).toEqual([{ effectiveFrom: '2026-10-28', cutoffMinutes: 240 }])
    expect(calls.from).toEqual(['business_day_cutoffs'])
    expect(calls.select).toEqual(['effective_from, cutoff_minutes'])
    expect(calls.eq).toEqual(['tenant_id', TENANT])
    expect(calls.order).toEqual(['effective_from', { ascending: true }])
    expect(calls.limit).toEqual([CUTOFF_ROW_LIMIT])
  })

  it('treats no rows as midnight', async () => {
    const { db } = fakeDb({ data: [], error: null })
    await expect(readCutoffSchedule(db, TENANT)).resolves.toEqual(MIDNIGHT_SCHEDULE)
  })

  it('treats a table that does not exist yet as midnight (no store can have set a cutoff)', async () => {
    const { db } = fakeDb({ data: null, error: { code: 'PGRST205', message: 'Could not find the table' } })
    await expect(readCutoffSchedule(db, TENANT)).resolves.toEqual(MIDNIGHT_SCHEDULE)
  })

  it('refuses when the read fails', async () => {
    const { db } = fakeDb({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } })
    await expect(readCutoffSchedule(db, TENANT)).rejects.toThrow(/business day/i)
  })

  it('refuses when the network throws', async () => {
    const { db } = fakeDb(new Error('fetch failed'))
    await expect(readCutoffSchedule(db, TENANT)).rejects.toThrow(/business day/i)
  })

  it('refuses rows it cannot trust', async () => {
    const { db } = fakeDb({ data: [{ effective_from: '2026-10-28', cutoff_minutes: 999 }], error: null })
    await expect(readCutoffSchedule(db, TENANT)).rejects.toThrow()
  })

  it('refuses a missing or malformed tenant before reading', async () => {
    const { db, calls } = fakeDb({ data: [], error: null })
    await expect(readCutoffSchedule(db, 'not-a-uuid')).rejects.toThrow()
    expect(calls.from).toBeUndefined()
  })
})

describe('readCutoffScheduleForDisplay (displays: midnight, flagged)', () => {
  it('passes a good schedule through, not flagged', async () => {
    const { db } = fakeDb({ data: [{ effective_from: '2026-10-28', cutoff_minutes: 240 }], error: null })
    await expect(readCutoffScheduleForDisplay(db, TENANT)).resolves.toEqual({
      schedule: [{ effectiveFrom: '2026-10-28', cutoffMinutes: 240 }],
      isFallback: false,
    })
  })

  it('falls back to midnight and flags it when the read fails', async () => {
    const { db } = fakeDb({ data: null, error: { code: '57014', message: 'timeout' } })
    await expect(readCutoffScheduleForDisplay(db, TENANT)).resolves.toEqual({
      schedule: MIDNIGHT_SCHEDULE,
      isFallback: true,
    })
    expect(console.error).toHaveBeenCalled()
  })

  it('does not flag a store that simply has no cutoff', async () => {
    const { db } = fakeDb({ data: [], error: null })
    await expect(readCutoffScheduleForDisplay(db, TENANT)).resolves.toEqual({
      schedule: MIDNIGHT_SCHEDULE,
      isFallback: false,
    })
  })
})
