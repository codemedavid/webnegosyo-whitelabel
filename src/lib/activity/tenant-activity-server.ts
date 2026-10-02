/**
 * The I/O shell behind the superadmin activity numbers.
 *
 * Routes every store through `resolveOrderBackend` — the same function
 * checkout writes through — rather than "has a Convex URL". Sixteen
 * platform-pinned stores still carry a stale Convex URL, and routing on the
 * URL is what makes the older platform analytics read them as zero.
 *
 * Cached for two minutes per window: the Convex half is a fan-out to every
 * Convex store's own deployment, and two superadmin screens read it. A failed
 * platform read is never cached — it throws inside the cache and the page
 * falls back to an uncached, degraded read.
 */

import { unstable_cache } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { listTenantSecrets } from '@/lib/tenant-secrets'
import { resolveOrderBackend, type OrderBackendPreference } from '@/lib/order-backend'
import type { ConvexTenantTarget } from '@/lib/queries/convex-platform-aggregator'
import { fetchConvexActivity, type ConvexActivityWindow } from '@/lib/activity/convex-activity'
import {
  buildActivityRows,
  platformRowsToStats,
  summarizeActivity,
  type ActivitySummary,
  type ActivityTenant,
  type PlatformActivityRow,
  type TenantActivityRow,
  type TenantActivityStats,
} from '@/lib/activity/tenant-activity'

const PAGE = 1000
const MAX_TENANT_ROWS = 20000
const CACHE_SECONDS = 120

export interface TenantActivityReport {
  rows: TenantActivityRow[]
  summary: ActivitySummary
  /** When the numbers were read, ISO. The page shows it; they may be cached. */
  generatedAt: string
  /** Set when the platform half could not be read. */
  platformError: string | null
}

interface TenantDirectoryRow {
  id: string
  name: string | null
  slug: string | null
  is_active: boolean | null
  order_backend: OrderBackendPreference | null
  convex_deployment_url: string | null
}

interface ActivityDirectory {
  tenants: ActivityTenant[]
  convexTargets: ConvexTenantTarget[]
}

type AdminClient = ReturnType<typeof createAdminClient>

async function loadTenantRows(admin: AdminClient): Promise<TenantDirectoryRow[]> {
  const rows: TenantDirectoryRow[] = []
  for (let from = 0; from < MAX_TENANT_ROWS; from += PAGE) {
    const { data, error } = await admin
      .from('tenants')
      .select('id, name, slug, is_active, order_backend, convex_deployment_url')
      .order('name')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`Could not read stores: ${error.message}`)
    const batch = (data ?? []) as unknown as TenantDirectoryRow[]
    rows.push(...batch)
    if (batch.length < PAGE) break
  }
  return rows
}

async function loadDirectory(admin: AdminClient): Promise<ActivityDirectory> {
  const rows = await loadTenantRows(admin)

  const tenants = rows.map(
    (row): ActivityTenant => ({
      tenantId: row.id,
      name: row.name ?? 'Unnamed store',
      slug: row.slug ?? '',
      isActive: row.is_active ?? false,
      backend: resolveOrderBackend(row),
    })
  )

  const convexRows = rows.filter(
    (row, index) => tenants[index].backend === 'convex' && row.convex_deployment_url?.trim()
  )
  const secrets = await listTenantSecrets(
    admin,
    convexRows.map((row) => row.id)
  )

  const convexTargets = convexRows.flatMap((row): ConvexTenantTarget[] => {
    const key = secrets.get(row.id)?.convex_deploy_key?.trim()
    const url = row.convex_deployment_url?.trim()
    return key && url ? [{ tenantId: row.id, url, key }] : []
  })

  return { tenants, convexTargets }
}

async function loadPlatformStats(
  admin: AdminClient,
  window: ConvexActivityWindow
): Promise<Map<string, TenantActivityStats>> {
  // Untyped: the generated Database types predate this function.
  const { data, error } = await (admin as unknown as SupabaseClient).rpc(
    'platform_tenant_order_activity',
    {
      p_start: new Date(window.startMs).toISOString(),
      p_end: new Date(window.endMs).toISOString(),
    }
  )
  if (error) throw new Error(`Could not read platform orders: ${error.message}`)
  return platformRowsToStats((data ?? []) as PlatformActivityRow[])
}

function toReport(
  directory: ActivityDirectory,
  platformStats: Map<string, TenantActivityStats> | null,
  convexEntries: Awaited<ReturnType<typeof fetchConvexActivity>>,
  platformError: string | null
): TenantActivityReport {
  const rows = buildActivityRows(directory.tenants, platformStats, convexEntries)
  return {
    rows,
    summary: summarizeActivity(rows),
    generatedAt: new Date().toISOString(),
    platformError,
  }
}

/** The full read. Throws when the platform half fails, so it is never cached. */
async function readActivity(startMs: number, endMs: number): Promise<TenantActivityReport> {
  const admin = createAdminClient()
  const window = { startMs, endMs }
  const directory = await loadDirectory(admin)
  const [platformStats, convexEntries] = await Promise.all([
    loadPlatformStats(admin, window),
    fetchConvexActivity(directory.convexTargets, window),
  ])
  return toReport(directory, platformStats, convexEntries, null)
}

/** The degraded read: platform stores marked unreachable instead of failing. */
async function readActivityDegraded(
  window: ConvexActivityWindow,
  platformError: string
): Promise<TenantActivityReport> {
  const admin = createAdminClient()
  const directory = await loadDirectory(admin)
  const convexEntries = await fetchConvexActivity(directory.convexTargets, window)
  return toReport(directory, null, convexEntries, platformError)
}

const readActivityCached = unstable_cache(readActivity, ['superadmin-tenant-activity-v1'], {
  revalidate: CACHE_SECONDS,
})

/**
 * Every store's order activity in `[startMs, endMs)`.
 *
 * Throws only when the store directory itself cannot be read — without it
 * there is nothing to show.
 */
export async function getTenantActivity(
  window: ConvexActivityWindow
): Promise<TenantActivityReport> {
  try {
    return await readActivityCached(window.startMs, window.endMs)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[tenant-activity] platform read failed:', message)
    return readActivityDegraded(window, message)
  }
}
