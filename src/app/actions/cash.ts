'use server'

/**
 * Cash & remits server actions (CONTRACTS §8).
 *
 * Each one: parse the input (zod) → resolve the store from its slug → check
 * the key (`cash_manage`; `settings` for the business-day cutoff) → write
 * through the CALLER's cookie session (RLS and the definer RPCs' own checks
 * are the boundary; writers assert affected rows because RLS refusals are
 * silent) → refresh the Cash page.
 *
 * No `export type` here: a type re-export from a 'use server' file passes dev
 * and tsc but breaks `next build`. Types live in @/lib/cash.
 */

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { verifyTenantPermission } from '@/lib/admin-service'
import { SubscriptionPausedError } from '@/lib/billing/subscription-gate'
import { getCachedTenantBySlug } from '@/lib/cache'
import { asCashRpcClient, type CashActionResult } from '@/lib/cash/cash-rpc'
import { setBusinessDayCutoff } from '@/lib/cash/cutoff'
import {
  SERVICE_PERIOD_NAME_TAKEN,
  SERVICE_PERIOD_NOT_SAVED,
  archiveServicePeriod,
  createServicePeriod,
  listServicePeriods,
  servicePeriodInputSchema,
  updateServicePeriod,
  type ServicePeriod,
} from '@/lib/cash/service-periods'
import { cashSettingsPatchSchema, saveCashSettings, type CashSettings } from '@/lib/cash/settings'
import type { StaffPermissionKey } from '@/lib/staff-permissions'
import { createClient } from '@/lib/supabase/server'

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/i
const NOT_FOUND = 'This store could not be found.'
const NO_ACCESS = 'Only the owner or someone who handles cash can change this.'
const NO_SETTINGS_ACCESS = 'Only the owner or someone with Settings can change when the business day ends.'
const SOMETHING_WRONG = 'Something went wrong. Nothing was changed. Try again in a moment.'

/** Sentences the services write for staff; anything else is logged and replaced. */
const SAFE_SENTENCES = new Set([SERVICE_PERIOD_NAME_TAKEN, SERVICE_PERIOD_NOT_SAVED])

function cashPath(tenantSlug: string): string {
  return `/${encodeURIComponent(tenantSlug)}/admin/cash`
}

function failure<T>(error: string): CashActionResult<T> {
  return { ok: false, error }
}

async function authorize(tenantSlug: string, permission: StaffPermissionKey, refusal: string): Promise<{ tenantId: string } | { error: string }> {
  if (!SLUG_RE.test(tenantSlug)) return { error: NOT_FOUND }
  const tenant = await getCachedTenantBySlug(tenantSlug)
  if (!tenant) return { error: NOT_FOUND }
  try {
    await verifyTenantPermission(tenant.id, permission)
    return { tenantId: tenant.id }
  } catch (error) {
    if (error instanceof SubscriptionPausedError) return { error: error.message }
    return { error: refusal }
  }
}

async function runCashAction<S extends z.ZodType, T>(
  tenantSlug: string,
  input: unknown,
  schema: S,
  label: string,
  permission: StaffPermissionKey,
  work: (tenantId: string, db: SupabaseClient, parsed: z.output<S>) => Promise<CashActionResult<T>>,
): Promise<CashActionResult<T>> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? 'Check what you entered and try again.')
  try {
    const caller = await authorize(tenantSlug, permission, permission === 'settings' ? NO_SETTINGS_ACCESS : NO_ACCESS)
    if ('error' in caller) return failure(caller.error)
    const db = (await createClient()) as unknown as SupabaseClient
    const result = await work(caller.tenantId, db, parsed.data as z.output<S>)
    if (result.ok) revalidatePath(cashPath(tenantSlug))
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (SAFE_SENTENCES.has(message)) return failure(message)
    console.error(`[cash] ${label}:`, message || error)
    return failure(SOMETHING_WRONG)
  }
}

/** Saves the changed cash rules (only the keys given). */
export async function saveCashSettingsAction(tenantSlug: string, input: unknown): Promise<CashActionResult<CashSettings>> {
  return runCashAction(tenantSlug, input, cashSettingsPatchSchema, 'save settings', 'cash_manage', async (tenantId, db, patch) => {
    if (Object.keys(patch).length === 0) return failure('Nothing to save.')
    const result = await saveCashSettings(asCashRpcClient(db), tenantId, patch)
    return result.ok ? { ok: true, data: result.data } : failure(result.error.message)
  })
}

const cutoffSchema = z.object({ cutoffMinutes: z.number().int() }).strict()

/** Changes when the business day ends; returns the first business day it applies to. */
export async function setBusinessDayCutoffAction(
  tenantSlug: string,
  input: unknown,
): Promise<CashActionResult<{ effectiveFrom: string }>> {
  return runCashAction(tenantSlug, input, cutoffSchema, 'set cutoff', 'settings', async (tenantId, db, { cutoffMinutes }) => {
    const result = await setBusinessDayCutoff(asCashRpcClient(db), tenantId, cutoffMinutes)
    return result.ok ? { ok: true, data: { effectiveFrom: result.data } } : failure(result.error.message)
  })
}

const savePeriodSchema = servicePeriodInputSchema.extend({ id: z.string().uuid().nullable() }).strict()

/** Adds a named shift (id null) or changes one. */
export async function saveServicePeriodAction(tenantSlug: string, input: unknown): Promise<CashActionResult<ServicePeriod>> {
  return runCashAction(tenantSlug, input, savePeriodSchema, 'save shift', 'cash_manage', async (tenantId, db, { id, ...period }) => {
    if (id) return { ok: true, data: await updateServicePeriod(db, tenantId, id, period) }
    const existing = await listServicePeriods(db, tenantId)
    const nextSort = existing.reduce((max, row) => Math.max(max, row.sort), -1) + 1
    return { ok: true, data: await createServicePeriod(db, tenantId, period, nextSort) }
  })
}

const archivePeriodSchema = z.object({ id: z.string().uuid() }).strict()

/** Removes a named shift from new days (archived; past reports keep its name). */
export async function archiveServicePeriodAction(tenantSlug: string, input: unknown): Promise<CashActionResult<null>> {
  return runCashAction(tenantSlug, input, archivePeriodSchema, 'archive shift', 'cash_manage', async (tenantId, db, { id }) => {
    await archiveServicePeriod(db, tenantId, id)
    return { ok: true, data: null }
  })
}
