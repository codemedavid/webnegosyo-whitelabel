import 'server-only'

import { getRequestCaller } from '@/lib/auth/request-caller'
import { readCutoffScheduleForDisplay, type CutoffScheduleRead } from '@/lib/business-day/read-schedule'
import { MIDNIGHT_SCHEDULE } from '@/lib/business-day/trading-day'
import { getCachedTenantBySlug } from '@/lib/cache'
import { resolveOrderBackend } from '@/lib/order-backend'
import { isMultiBranchEnabled } from '@/lib/outlets/multi-branch-flag'
import { createClient } from '@/lib/supabase/server'
import { buildReportContext, type ReportOutlet, type ReportPageState } from './report-context'
import { asReportRpcClient, type ReportRpcClient } from './report-rpc'

export type LoadedReportPage = ReportPageState | { kind: 'not_found' }

/**
 * The store's outlets, as the caller may read them. A failed read is
 * surfaced: an empty list would read as "no branches" and drop the picker,
 * silently showing a multi-branch owner one total.
 */
async function readOutlets(tenantId: string): Promise<ReportOutlet[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('outlets')
    .select('id, name, is_active')
    .eq('tenant_id', tenantId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw new Error(`Could not read the store's branches: ${error.message}`)
  return (data ?? []).map((row) => ({ id: row.id, name: row.name, isActive: row.is_active === true }))
}

const MIDNIGHT_READ: CutoffScheduleRead = { schedule: MIDNIGHT_SCHEDULE, isFallback: false }

/** The business-day cutoffs, through the caller's session (a display: midnight + flag on failure). */
async function readSchedule(tenantId: string): Promise<CutoffScheduleRead> {
  return readCutoffScheduleForDisplay(await createClient(), tenantId)
}

/**
 * Called once per page; sections get the result as a prop. The identity and
 * tenant reads underneath are already request-cached.
 */
export async function loadReportPage(
  tenantSlug: string,
  searchParams: Record<string, string | string[] | undefined>,
): Promise<LoadedReportPage> {
  const tenant = await getCachedTenantBySlug(tenantSlug)
  if (!tenant) return { kind: 'not_found' }

  const backend = resolveOrderBackend(tenant)
  const isPlatform = backend === 'platform'
  const [{ appUser, roleError }, outlets, scheduleRead] = await Promise.all([
    getRequestCaller(),
    isPlatform ? readOutlets(tenant.id) : Promise.resolve([]),
    isPlatform ? readSchedule(tenant.id) : Promise.resolve(MIDNIGHT_READ),
  ])
  // Fail closed: an errored account read is no account, never store-wide.
  const caller = roleError ? null : appUser

  return buildReportContext({
    tenant: {
      id: tenant.id,
      slug: tenantSlug,
      multiBranchEnabled: isMultiBranchEnabled(tenant),
      hasConvexDeployment: Boolean(tenant.convex_deployment_url?.trim()),
    },
    backend,
    appUser: caller,
    outlets,
    searchParams,
    now: Date.now(),
    schedule: scheduleRead.schedule,
    isScheduleFallback: scheduleRead.isFallback,
  })
}

/** The caller's own session client: RLS and the `reports` key apply to every read. */
export async function reportClient(): Promise<ReportRpcClient> {
  return asReportRpcClient(await createClient())
}
