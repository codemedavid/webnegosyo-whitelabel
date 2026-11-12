import 'server-only'

import { appDb } from '@/lib/app-api/service-db'
import type { AdminClient } from '@/lib/supabase/admin'
import { createCachedRead, doNotCache } from '@/lib/storefront/cached-read'

/**
 * Which store a customer-app build belongs to, from its native application id.
 *
 * Read with the service role: tenant_apps is service-role only (the identity
 * table also holds store-account and release settings no phone should list).
 * Only the fields the app is allowed to learn leave this module.
 */

/** The development build's id (customer-app/app.config.ts DEV_IDENTITY). */
export const DEV_APPLICATION_ID = 'com.webnegosyo.customer.dev'

export type TenantAppStatus = 'draft' | 'live' | 'paused'

export interface PlatformRelease {
  minimumVersion: string | null
  latestVersion: string | null
  storeUrl: string | null
}

export interface ResolvedTenantApp {
  tenantId: string
  slug: string
  status: TenantAppStatus
  ios: PlatformRelease
  android: PlatformRelease
}

interface TenantAppRow {
  tenant_id: string
  status: TenantAppStatus
  min_version_ios: string | null
  latest_version_ios: string | null
  min_version_android: string | null
  latest_version_android: string | null
  app_store_url: string | null
  play_store_url: string | null
  tenant: { slug: string; is_active: boolean } | null
}

const TENANT_APP_SELECT =
  'tenant_id, status, min_version_ios, latest_version_ios, min_version_android, latest_version_android, app_store_url, play_store_url, tenant:tenants(slug, is_active)'

export const customerAppTag = (applicationId: string) => `customer-app:${applicationId}`

/** Result of a lookup: a store, none, or a read that failed (never cached). */
export type TenantAppLookup = { app: ResolvedTenantApp | null; error: string | null }

const NO_RELEASE: PlatformRelease = { minimumVersion: null, latestVersion: null, storeUrl: null }

function toResolved(row: TenantAppRow): ResolvedTenantApp | null {
  if (!row.tenant || row.tenant.is_active !== true) return null
  return {
    tenantId: row.tenant_id,
    slug: row.tenant.slug,
    status: row.status,
    ios: { minimumVersion: row.min_version_ios, latestVersion: row.latest_version_ios, storeUrl: row.app_store_url },
    android: { minimumVersion: row.min_version_android, latestVersion: row.latest_version_android, storeUrl: row.play_store_url },
  }
}

/**
 * The dev build serves one configured store on a developer's machine only:
 * never on a Vercel production OR preview deployment (previews share the
 * production database), whatever APP_DEV_TENANT_SLUG says.
 */
export function isDevIdentityEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const vercelEnv = env.VERCEL_ENV
  return Boolean(env.APP_DEV_TENANT_SLUG?.trim()) && vercelEnv !== 'production' && vercelEnv !== 'preview'
}

async function devTenantApp(client: AdminClient): Promise<TenantAppLookup> {
  const slug = process.env.APP_DEV_TENANT_SLUG?.trim()
  if (!slug || !isDevIdentityEnabled()) return { app: null, error: null }
  const { data, error } = await client.from('tenants').select('id, slug, is_active').eq('slug', slug).maybeSingle()
  if (error) return { app: null, error: error.message }
  if (!data || data.is_active !== true) return { app: null, error: null }
  return { app: { tenantId: data.id, slug: data.slug, status: 'draft', ios: NO_RELEASE, android: NO_RELEASE }, error: null }
}

async function loadTenantApp(applicationId: string) {
  try {
    const client = appDb()
    if (applicationId === DEV_APPLICATION_ID) {
      const dev = await devTenantApp(client)
      return dev.error ? doNotCache(dev) : dev
    }
    const { data, error } = await client
      .from('tenant_apps')
      .select(TENANT_APP_SELECT)
      .or(`bundle_id.eq.${applicationId},android_package.eq.${applicationId}`)
      // Deterministic if one store's bundle id ever equals another's package (App Studio refuses that).
      .order('tenant_id', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (error) return doNotCache<TenantAppLookup>({ app: null, error: error.message })
    const app = data ? toResolved(data as unknown as TenantAppRow) : null
    // Misses are not cached: arbitrary ids must not be able to fill the data cache.
    return app ? ({ app, error: null } satisfies TenantAppLookup) : doNotCache<TenantAppLookup>({ app: null, error: null })
  } catch (caught) {
    return doNotCache<TenantAppLookup>({ app: null, error: caught instanceof Error ? caught.message : String(caught) })
  }
}

/**
 * Cached like every storefront read (5 min). `applicationId` must already be
 * validated by `readApplicationId` — it is interpolated into a PostgREST
 * filter, and that parser only admits reverse-DNS characters.
 */
export const getTenantApp = createCachedRead(['customer-app', 'tenant-app'], loadTenantApp, {
  tags: (applicationId) => [customerAppTag(applicationId)],
})

