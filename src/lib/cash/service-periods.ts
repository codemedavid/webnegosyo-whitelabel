/**
 * Named shifts — "service periods" (CONTRACTS §1.8, §2 `service_periods`):
 * "Day shift 12 PM–8 PM", "Night shift 8 PM–2 AM". Optional; store-wide
 * (`outlet_id` null) or one branch's. The UI calls them "Shifts".
 *
 * Reads: store members (RLS, branch reach). Writes: `cash_manage` (RLS).
 * Archived, never deleted (a past day's report still names its shifts).
 * RLS refusals are silent zero-row answers, so every write ASSERTS the row it
 * changed and throws `SERVICE_PERIOD_NOT_SAVED` otherwise.
 *
 * Which window a period covers on a business day is `servicePeriodWindow`
 * (`@/lib/business-day/service-periods`, owner: bizday); this module only
 * stores and lists them.
 *
 * Web twin of `webnegosyo-app/lib/cash/service-periods.ts` (owner: app-owner).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { ServicePeriodTimes } from '@/lib/business-day/service-periods'

export interface ServicePeriod extends ServicePeriodTimes {
  id: string
  /** null = every branch. */
  outletId: string | null
  name: string
  sort: number
  archivedAt: string | null
}

export const SERVICE_PERIOD_NAME_MAX = 40
const MINUTES_PER_DAY = 1440

const minuteOfDay = z.number().int().min(0).max(MINUTES_PER_DAY - 1)

export const servicePeriodInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Give the shift a name, like “Day shift”.')
      .max(SERVICE_PERIOD_NAME_MAX, `Keep the name under ${SERVICE_PERIOD_NAME_MAX} characters.`),
    startsMinutes: minuteOfDay,
    endsMinutes: minuteOfDay,
    outletId: z.string().uuid().nullable(),
  })
  .strict()

export type ServicePeriodInput = z.infer<typeof servicePeriodInputSchema>

export const SERVICE_PERIOD_NOT_SAVED = 'That shift wasn’t saved. You may not have access to it, or it was changed elsewhere. Reload and try again.'

const COLUMNS = 'id, outlet_id, name, starts_minutes, ends_minutes, sort, archived_at'

interface ServicePeriodRow {
  id: string
  outlet_id: string | null
  name: string
  starts_minutes: number
  ends_minutes: number
  sort: number | null
  archived_at: string | null
}

const rowSchema = z.object({
  id: z.string().min(1),
  outlet_id: z.string().nullable(),
  name: z.string(),
  starts_minutes: minuteOfDay,
  ends_minutes: minuteOfDay,
  sort: z.number().int().nullable(),
  archived_at: z.string().nullable(),
})

function toServicePeriod(raw: unknown): ServicePeriod {
  const row: ServicePeriodRow = rowSchema.parse(raw)
  return {
    id: row.id,
    outletId: row.outlet_id,
    name: row.name,
    startsMinutes: row.starts_minutes,
    endsMinutes: row.ends_minutes,
    sort: row.sort ?? 0,
    archivedAt: row.archived_at,
  }
}

interface DbError {
  code?: string
  message: string
}

export const SERVICE_PERIOD_NAME_TAKEN = 'There is already a shift with that name. Pick another name.'
const UNIQUE_VIOLATION = '23505'

function fail(label: string, error: DbError): never {
  // service_periods_live_name: one live name per branch (or store-wide).
  if (error.code === UNIQUE_VIOLATION) throw new Error(SERVICE_PERIOD_NAME_TAKEN)
  console.error(`[cash] service_periods ${label} failed`, `${error.code ?? 'no code'}: ${error.message}`)
  throw new Error(SERVICE_PERIOD_NOT_SAVED)
}

/** The single row a write changed, or throw: zero rows = refused. */
function onlyRow(data: unknown): ServicePeriod {
  if (!Array.isArray(data) || data.length !== 1) throw new Error(SERVICE_PERIOD_NOT_SAVED)
  return toServicePeriod(data[0])
}

/** The store's live periods (a handful), in their order. Throws on a failed read: never an empty list. */
export async function listServicePeriods(db: SupabaseClient, tenantId: string): Promise<ServicePeriod[]> {
  const { data, error } = await db
    .from('service_periods')
    .select(COLUMNS)
    .eq('tenant_id', tenantId)
    .is('archived_at', null)
    .order('sort', { ascending: true })
    .order('starts_minutes', { ascending: true })
    .limit(100)
  if (error) throw new Error(`Could not read the store’s shifts: ${error.message}`)
  return (data ?? []).map(toServicePeriod)
}

/** A branch reads the every-branch periods plus its own; the whole store only the every-branch ones. */
export function periodsForBranch<T extends Pick<ServicePeriod, 'outletId'>>(periods: readonly T[], outletId: string | null): T[] {
  return periods.filter((period) => period.outletId === null || (outletId !== null && period.outletId === outletId))
}

function clockText(minutes: number): string {
  const hours24 = Math.floor(minutes / 60) % 24
  const mins = minutes % 60
  const suffix = hours24 < 12 ? 'AM' : 'PM'
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12
  return mins === 0 ? `${hours12} ${suffix}` : `${hours12}:${String(mins).padStart(2, '0')} ${suffix}`
}

/** "12 PM–8 PM", "8 PM–2 AM". */
export function formatPeriodTimes(period: ServicePeriodTimes): string {
  return `${clockText(period.startsMinutes)}–${clockText(period.endsMinutes)}`
}

function toColumns(input: ServicePeriodInput): Record<string, unknown> {
  return {
    outlet_id: input.outletId,
    name: input.name,
    starts_minutes: input.startsMinutes,
    ends_minutes: input.endsMinutes,
  }
}

export async function createServicePeriod(
  db: SupabaseClient,
  tenantId: string,
  input: ServicePeriodInput,
  sort: number,
): Promise<ServicePeriod> {
  const { data, error } = await db
    .from('service_periods')
    .insert({ tenant_id: tenantId, ...toColumns(input), sort })
    .select(COLUMNS)
  if (error) fail('insert', error)
  return onlyRow(data)
}

export async function updateServicePeriod(
  db: SupabaseClient,
  tenantId: string,
  periodId: string,
  input: ServicePeriodInput,
): Promise<ServicePeriod> {
  const { data, error } = await db
    .from('service_periods')
    .update(toColumns(input))
    .eq('tenant_id', tenantId)
    .eq('id', periodId)
    .is('archived_at', null)
    .select(COLUMNS)
  if (error) fail('update', error)
  return onlyRow(data)
}

/** Archive (never delete): past reports keep naming it. */
export async function archiveServicePeriod(db: SupabaseClient, tenantId: string, periodId: string): Promise<void> {
  const { data, error } = await db
    .from('service_periods')
    .update({ archived_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', periodId)
    .is('archived_at', null)
    .select('id')
  if (error) fail('archive', error)
  if (!Array.isArray(data) || data.length !== 1) throw new Error(SERVICE_PERIOD_NOT_SAVED)
}
