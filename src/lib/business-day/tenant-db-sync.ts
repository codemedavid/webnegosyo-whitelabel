/**
 * Copy the business-day schedule into a tenant's OWN Supabase order database
 * (`order_backend = 'supabase'`), whose `assign_daily_order_number` resets #01
 * at the cutoff (`supabase-order-schema.ts`, bundle v4). That database has no
 * link to the platform, so the web app writes the rows with the tenant's
 * service key.
 *
 * Upsert first, then delete what the platform no longer has, so an order
 * inserted in between never sees an empty table (midnight) for a store that
 * has a cutoff. Pure over an injected client; tested in place.
 */
import type { CutoffSchedule } from '@/lib/business-day/trading-day'

interface WriteAnswer {
  error: { message: string } | null
}

/** The slice of a service-role client this writer uses. */
export interface TenantCutoffDb {
  from(table: 'business_day_cutoffs'): {
    upsert(rows: object[], options: { onConflict: string }): PromiseLike<WriteAnswer>
    delete(): {
      eq(column: string, value: string): PromiseLike<WriteAnswer> & {
        not(column: string, operator: string, value: string): PromiseLike<WriteAnswer>
      }
    }
  }
}

export async function writeCutoffsToTenantDb(db: TenantCutoffDb, tenantId: string, schedule: CutoffSchedule): Promise<void> {
  const table = () => db.from('business_day_cutoffs')
  if (schedule.length > 0) {
    const rows = schedule.map((change) => ({
      tenant_id: tenantId,
      effective_from: change.effectiveFrom,
      cutoff_minutes: change.cutoffMinutes,
    }))
    const upserted = await table().upsert(rows, { onConflict: 'tenant_id,effective_from' })
    if (upserted.error) throw new Error(`Could not copy the business day to the store's database: ${upserted.error.message}`)
  }
  const keep = schedule.map((change) => change.effectiveFrom)
  const stale = table().delete().eq('tenant_id', tenantId)
  const removed = await (keep.length === 0 ? stale : stale.not('effective_from', 'in', `(${keep.join(',')})`))
  if (removed.error) throw new Error(`Could not copy the business day to the store's database: ${removed.error.message}`)
}
