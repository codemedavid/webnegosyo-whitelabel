/**
 * The MCP's upsell funnel read: shown → clicked → converted counts and rates
 * over a trailing window.
 *
 * Upsell analytics events only ever land in a tenant's Convex deployment —
 * regardless of which backend holds its ORDERS — so this read is Convex-only by
 * design. A tenant without a deployment (or an unreachable one) gets an
 * explicit `available: false` with the reason, never a fabricated all-zero
 * funnel that reads as "upsells don't work for this store".
 */

import type { ProvisioningCtx } from '@/lib/provisioning/context'
import { createConvexServerClient } from '@/lib/convex/server'

const DEFAULT_WINDOW_DAYS = 30
const CONVEX_UPSELL_PATH = 'analytics:getUpsellAnalytics'

interface ConvexQueryClient {
  query<T = unknown>(path: string, args: Record<string, unknown>): Promise<T>
}

export interface UpsellFunnel {
  shown: number
  clicked: number
  converted: number
  /** clicked / shown, 0..1 (0 when nothing was shown). */
  clickRate: number
  /** converted / shown, 0..1 (0 when nothing was shown). */
  conversionRate: number
}

export interface UpsellPerformance {
  windowDays: number
  /** False when the tenant has no reachable Convex analytics deployment. */
  available: boolean
  funnel?: UpsellFunnel
  note?: string
}

export interface FetchUpsellPerformanceOptions {
  windowDays?: number
  convexFactory?: (url: string, key: string) => ConvexQueryClient
}

/** The tenant columns this read needs. Structural, so tests pass plain objects. */
export interface UpsellPerformanceTenant {
  id: string
  convex_deployment_url?: string | null
  convex_deploy_key?: string | null
}

function toNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** Upsell funnel for one tenant, read from its own Convex deployment. */
export async function fetchUpsellPerformance(
  tenant: UpsellPerformanceTenant,
  options: FetchUpsellPerformanceOptions = {},
): Promise<UpsellPerformance> {
  const { windowDays = DEFAULT_WINDOW_DAYS, convexFactory = createConvexServerClient } = options

  const url = tenant.convex_deployment_url?.trim()
  const key = tenant.convex_deploy_key?.trim()
  if (!url || !key) {
    return {
      windowDays,
      available: false,
      note: 'This tenant has no Convex analytics deployment configured, so upsell events were never recorded for it. This is an absence of tracking, not proof that upsells perform at zero.',
    }
  }

  try {
    const raw = await convexFactory(url, key).query<Record<string, unknown>>(CONVEX_UPSELL_PATH, {
      daysBack: windowDays,
    })
    return {
      windowDays,
      available: true,
      funnel: {
        shown: toNumber(raw?.shown),
        clicked: toNumber(raw?.clicked),
        converted: toNumber(raw?.converted),
        clickRate: toNumber(raw?.clickRate),
        conversionRate: toNumber(raw?.conversionRate),
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    return {
      windowDays,
      available: false,
      note: `Convex deployment could not be reached: ${message}`,
    }
  }
}

/**
 * Resolve a tenant by id through the service-role provisioning client, then
 * read its upsell funnel. A missing tenant THROWS — a caller mistake must not
 * render as an unavailable funnel for a store that isn't there.
 */
export async function fetchUpsellPerformanceForTenantId(
  tenantId: string,
  ctx: ProvisioningCtx,
  windowDays: number = DEFAULT_WINDOW_DAYS,
  options: Pick<FetchUpsellPerformanceOptions, 'convexFactory'> = {},
): Promise<UpsellPerformance> {
  const { data, error } = await ctx.client
    .from('tenants')
    .select('id, convex_deployment_url, convex_deploy_key')
    .eq('id', tenantId)
    .single()

  if (error || !data) {
    throw new Error(`Tenant ${tenantId} could not be loaded: ${error?.message ?? 'not found'}`)
  }

  return fetchUpsellPerformance({ ...(data as unknown as UpsellPerformanceTenant), id: tenantId }, {
    windowDays,
    ...options,
  })
}
