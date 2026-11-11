/**
 * @jest-environment node
 *
 * business_day_of / business_day_bounds (supabase/migrations/20261027120000)
 * agree with tradingDayOf / tradingDayWindow (src/lib/business-day/trading-day.ts)
 * on random schedules and instants — the SQL buckets reports and stamps
 * staff_shifts.business_day, the TS draws every screen, so a disagreement
 * would put one sale on two different days.
 *
 * PGlite runs in tests/sql/business-day-worker.cjs (Jest cannot load its
 * wasm). Stores per run = FC_NUM_RUNS; FC_SEED replays.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import fc from 'fast-check'
import { tradingDayOf, tradingDayWindow, type CutoffChange, type CutoffSchedule } from '@/lib/business-day/trading-day'
import { propertyRuns } from '../../utils/property'

const WORKER = path.join(process.cwd(), 'tests/sql/business-day-worker.cjs')
const MAX_STORES = 2000
const BASE_DAY = Date.parse('2026-03-01T00:00:00.000Z')
const DAY_MS = 86_400_000
const PROBES_PER_STORE = 12

const dayKey = (offset: number) => new Date(BASE_DAY + offset * DAY_MS).toISOString().slice(0, 10)

const scheduleArb: fc.Arbitrary<CutoffSchedule> = fc
  .uniqueArray(fc.integer({ min: 0, max: 40 }), { maxLength: 4 })
  .chain((days) =>
    fc.tuple(...days.sort((a, b) => a - b).map((d) => fc.integer({ min: 0, max: 47 }).map((step): CutoffChange => ({ effectiveFrom: dayKey(d), cutoffMinutes: step * 15 })))),
  )
  .map((changes) => Object.freeze([...changes]))

// Instants across the schedule (incl. exactly on a cutoff, and a millisecond before).
const instantArb = fc.oneof(
  fc.integer({ min: -2 * DAY_MS, max: 44 * DAY_MS }).map((ms) => BASE_DAY - 8 * 3_600_000 + ms),
  fc.tuple(fc.integer({ min: -1, max: 42 }), fc.integer({ min: 0, max: 47 }), fc.constantFrom(0, -1)).map(
    ([day, step, nudge]) => BASE_DAY - 8 * 3_600_000 + day * DAY_MS + step * 15 * 60_000 + nudge,
  ),
)
const storeArb = fc.record({
  schedule: scheduleArb,
  instants: fc.array(instantArb, { minLength: PROBES_PER_STORE, maxLength: PROBES_PER_STORE }),
  days: fc.array(fc.integer({ min: -2, max: 43 }), { minLength: 4, maxLength: 4 }),
})

function tenantId(index: number): string {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`
}

describe('business_day_of / _bounds = tradingDayOf / tradingDayWindow', () => {
  const runs = Math.min(propertyRuns(), MAX_STORES)
  const seed = process.env.FC_SEED ? Number(process.env.FC_SEED) : 20261027
  const stores = fc.sample(storeArb, { numRuns: runs, seed })
  let answer: { of: string[]; bounds: { startIso: string; endIso: string }[] } = { of: [], bounds: [] }

  beforeAll(() => {
    const input = {
      stores: stores.map((s, i) => ({ tenantId: tenantId(i), schedule: s.schedule })),
      probes: stores.flatMap((s, i) => s.instants.map((ms) => ({ tenantId: tenantId(i), at: new Date(ms).toISOString() }))),
      days: stores.flatMap((s, i) => s.days.map((d) => ({ tenantId: tenantId(i), day: dayKey(d) }))),
    }
    const dir = mkdtempSync(path.join(tmpdir(), 'business-day-'))
    try {
      const file = path.join(dir, 'input.json')
      writeFileSync(file, JSON.stringify(input))
      answer = JSON.parse(execFileSync(process.execPath, [WORKER, file], { cwd: process.cwd(), maxBuffer: 256 * 1024 * 1024, encoding: 'utf8' }))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 300_000)

  test(`${runs} random schedules (seed ${seed}): every instant and every day agree`, () => {
    stores.forEach((store, i) => {
      const where = `store ${i} schedule ${JSON.stringify(store.schedule)} (replay: FC_SEED=${seed} FC_NUM_RUNS=${runs})`
      const wantOf = store.instants.map((ms) => tradingDayOf(new Date(ms).toISOString(), store.schedule))
      const gotOf = answer.of.slice(i * PROBES_PER_STORE, (i + 1) * PROBES_PER_STORE)
      expect({ where, of: gotOf }).toEqual({ where, of: wantOf })
      const wantBounds = store.days.map((d) => tradingDayWindow(dayKey(d), store.schedule))
      const gotBounds = answer.bounds.slice(i * 4, (i + 1) * 4)
      expect({ where, bounds: gotBounds }).toEqual({ where, bounds: wantBounds })
    })
    expect(stores.filter((s) => s.schedule.length > 0).length).toBeGreaterThan(runs / 2)
  })
})
