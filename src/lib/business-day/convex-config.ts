/**
 * The business-day schedule as a Convex `tenantConfig` row.
 *
 * Convex stores number their orders (#01) in their own deployment
 * (`convex-template/convex/orderNumber.ts`), which reads the cutoff from the
 * `business_day_cutoffs` row. Every config sync (tenant saves, Deploy Schema,
 * a cutoff change) merges this entry in.
 *
 * Read FAIL CLOSED: if the schedule cannot be read, the sync must fail, never
 * push "[]" (midnight) over a real schedule. A caller that leaves this entry
 * out keeps whatever the deployment already holds, which is the safe miss.
 */
import { readCutoffSchedule, type SessionClient } from '@/lib/business-day/read-schedule'
import type { CutoffSchedule } from '@/lib/business-day/trading-day'

/** Must match `BUSINESS_DAY_CUTOFFS_CONFIG_KEY` in `convex-template/convex/time.ts`. */
export const BUSINESS_DAY_CUTOFFS_CONFIG_KEY = 'business_day_cutoffs'

export function businessDayConfigEntry(schedule: CutoffSchedule): Record<string, string> {
  const rows = schedule.map(({ effectiveFrom, cutoffMinutes }) => ({ effectiveFrom, cutoffMinutes }))
  return { [BUSINESS_DAY_CUTOFFS_CONFIG_KEY]: JSON.stringify(rows) }
}

/** Throws when the schedule cannot be read (see above). */
export async function readBusinessDayConfigEntry(db: SessionClient, tenantId: string): Promise<Record<string, string>> {
  return businessDayConfigEntry(await readCutoffSchedule(db, tenantId))
}
