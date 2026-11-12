import 'server-only'
import { randomInt } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { createLoyaltyClaimCrypto } from '@/lib/loyalty/claim-crypto'
import type { Database, Json } from '@/types/supabase'
import { defaultAppIds, type AppIdentityInput, type AppListingInput, type AppReleaseInput } from './inputs'
import { sameDraft, type AppStudioDraft } from './home-draft'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * App Studio's reads and writes on `tenant_apps` / `tenant_app_configs`
 * (service role only: both tables are closed to anon and authenticated).
 * Callers (`src/app/actions/app-studio.ts`) check the console permission and
 * parse every input first. Each write asserts the row it changed, so a write
 * that touched nothing is an error, never "saved".
 */

type Db = SupabaseClient<Database>

/**
 * The service-role client App Studio reads and writes with: the two tables are
 * closed to anon and authenticated, and every caller (the superadmin page and
 * `src/app/actions/app-studio.ts`) has checked the `customer_apps.*` console
 * permission first.
 */
export function appStudioDb(): Db {
  return createAdminClient()
}
type AppRow = Database['public']['Tables']['tenant_apps']['Row']
type ConfigRow = Database['public']['Tables']['tenant_app_configs']['Row']

export class AppStudioError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AppStudioError'
  }
}

/** The editor only ever sends a few KB; this bounds a forged request. */
const MAX_DRAFT_BYTES = 64 * 1024

const APP_COLUMNS =
  'tenant_id, display_name, bundle_id, android_package, store_account, asc_app_id, play_track, listing, icon_url, splash_url, splash_background, status, min_version_ios, latest_version_ios, min_version_android, latest_version_android, app_store_url, play_store_url, created_at, updated_at, review_phone_e164, review_code_hash'

export type AppStudioApp = Omit<AppRow, 'review_code_hash'> & { hasReviewCode: boolean }

export interface AppStudioListRow {
  tenantId: string
  storeName: string
  storeSlug: string
  displayName: string
  bundleId: string
  status: AppRow['status']
  iconUrl: string | null
  publishedVersion: number
  publishedAt: string | null
  hasUnpublishedChanges: boolean
}

const withoutHash = ({ review_code_hash: hash, ...row }: AppRow): AppStudioApp => ({ ...row, hasReviewCode: hash !== null })

function failIf(error: { message: string; code?: string } | null, what: string): void {
  if (!error) return
  if (error.code === '23505') throw new AppStudioError('Another store’s app already uses that bundle id or Android package.')
  throw new AppStudioError(`Could not ${what}: ${error.message}`)
}

/** A saved draft that differs from what the app is being served. */
export function hasUnpublished(draft: unknown, published: unknown): boolean {
  const isEmpty = typeof draft !== 'object' || draft === null || Object.keys(draft).length === 0
  return !isEmpty && !sameDraft(draft, published ?? {})
}

export async function listApps(db: Db): Promise<AppStudioListRow[]> {
  const [apps, configs] = await Promise.all([
    db.from('tenant_apps').select('tenant_id, display_name, bundle_id, status, icon_url, tenants(name, slug)').order('created_at', { ascending: false }).limit(1000),
    db.from('tenant_app_configs').select('tenant_id, draft, published, published_version, published_at').limit(1000),
  ])
  failIf(apps.error, 'read the apps')
  failIf(configs.error, 'read the app configs')
  const byTenant = new Map((configs.data ?? []).map((row) => [row.tenant_id, row]))
  return (apps.data ?? []).map((row) => {
    const store = (Array.isArray(row.tenants) ? row.tenants[0] : row.tenants) as { name?: string; slug?: string } | null
    const config = byTenant.get(row.tenant_id)
    return {
      tenantId: row.tenant_id,
      storeName: store?.name ?? 'Unknown store',
      storeSlug: store?.slug ?? '',
      displayName: row.display_name,
      bundleId: row.bundle_id,
      status: row.status,
      iconUrl: row.icon_url,
      publishedVersion: config?.published_version ?? 0,
      publishedAt: config?.published_at ?? null,
      hasUnpublishedChanges: config ? hasUnpublished(config.draft, config.published) : false,
    }
  })
}

export interface AppStudioRecord {
  app: AppStudioApp
  config: Pick<ConfigRow, 'draft' | 'published' | 'published_version' | 'published_at' | 'updated_at'> | null
}

export async function readApp(db: Db, tenantId: string): Promise<AppStudioRecord | null> {
  const [app, config] = await Promise.all([
    db.from('tenant_apps').select(APP_COLUMNS).eq('tenant_id', tenantId).maybeSingle(),
    db.from('tenant_app_configs').select('draft, published, published_version, published_at, updated_at').eq('tenant_id', tenantId).maybeSingle(),
  ])
  failIf(app.error, 'read the app')
  failIf(config.error, 'read the app config')
  if (!app.data) return null
  return { app: withoutHash(app.data as AppRow), config: config.data ?? null }
}

/** A new draft app for a store, named after it, ids from its slug. */
export async function createApp(db: Db, tenantId: string, splashBackground: string | null): Promise<AppStudioApp> {
  const { data: tenant, error } = await db.from('tenants').select('id, name, slug').eq('id', tenantId).maybeSingle()
  failIf(error, 'read the store')
  if (!tenant) throw new AppStudioError('That store was not found.')
  const ids = defaultAppIds(tenant.slug)
  const inserted = await db
    .from('tenant_apps')
    .insert({
      tenant_id: tenant.id,
      display_name: tenant.name.trim().slice(0, 30).trim() || tenant.slug.slice(0, 30),
      bundle_id: ids.bundleId,
      android_package: ids.androidPackage,
      splash_background: splashBackground,
      status: 'draft',
    })
    .select(APP_COLUMNS)
    .single()
  if (inserted.error?.code === '23505' && inserted.error.message.includes('pkey')) throw new AppStudioError('This store already has an app.')
  failIf(inserted.error, 'set up the app')
  return withoutHash(inserted.data as AppRow)
}

async function updateApp(db: Db, tenantId: string, patch: Database['public']['Tables']['tenant_apps']['Update'], what: string): Promise<AppStudioApp> {
  const { data, error } = await db
    .from('tenant_apps')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .select(APP_COLUMNS)
    .maybeSingle()
  failIf(error, what)
  if (!data) throw new AppStudioError('This app no longer exists. Reload the page.')
  return withoutHash(data as AppRow)
}

/** The app's ids are its identity in both stores: frozen once it has gone live. */
export async function saveIdentity(db: Db, tenantId: string, input: AppIdentityInput, current: Pick<AppRow, 'status' | 'bundle_id' | 'android_package'>): Promise<AppStudioApp> {
  const idsChanged = input.bundleId !== current.bundle_id || input.androidPackage !== current.android_package
  if (idsChanged && current.status !== 'draft') throw new AppStudioError('The bundle id and Android package are locked once the app has gone live.')
  return updateApp(
    db,
    tenantId,
    {
      display_name: input.displayName,
      bundle_id: input.bundleId,
      android_package: input.androidPackage,
      icon_url: input.iconUrl,
      splash_url: input.splashUrl,
      splash_background: input.splashBackground,
      store_account: input.storeAccount,
    },
    'save the identity',
  )
}

export function saveListing(db: Db, tenantId: string, input: AppListingInput): Promise<AppStudioApp> {
  return updateApp(db, tenantId, { listing: input as unknown as Json }, 'save the store listing')
}

export function saveRelease(db: Db, tenantId: string, input: AppReleaseInput): Promise<AppStudioApp> {
  return updateApp(
    db,
    tenantId,
    {
      status: input.status,
      min_version_ios: input.minVersionIos,
      latest_version_ios: input.latestVersionIos,
      min_version_android: input.minVersionAndroid,
      latest_version_android: input.latestVersionAndroid,
      app_store_url: input.appStoreUrl,
      play_store_url: input.playStoreUrl,
      asc_app_id: input.ascAppId,
      play_track: input.playTrack,
    },
    'save the release settings',
  )
}

type Crypto = ReturnType<typeof createLoyaltyClaimCrypto>

/**
 * A fresh App Review code for `phone`. Only its hash is stored (the same key
 * the sign-in checks it with); the code is returned once to show the person.
 */
export async function issueReviewCode(db: Db, tenantId: string, phone: string, crypto: Crypto): Promise<{ app: AppStudioApp; code: string }> {
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0')
  const app = await updateApp(db, tenantId, { review_phone_e164: phone, review_code_hash: crypto.hashAppReviewCode(tenantId, code) }, 'set the review sign-in')
  return { app, code }
}

export function clearReviewCode(db: Db, tenantId: string): Promise<AppStudioApp> {
  return updateApp(db, tenantId, { review_phone_e164: null, review_code_hash: null }, 'remove the review sign-in')
}

export async function saveDraft(db: Db, tenantId: string, draft: AppStudioDraft, actorId: string): Promise<string> {
  if (JSON.stringify(draft).length > MAX_DRAFT_BYTES) throw new AppStudioError('This draft is too large to save.')
  const now = new Date().toISOString()
  const { data, error } = await db
    .from('tenant_app_configs')
    .upsert({ tenant_id: tenantId, draft: draft as unknown as Json, updated_by: actorId, updated_at: now }, { onConflict: 'tenant_id' })
    .select('updated_at')
    .single()
  failIf(error, 'save the draft')
  if (!data) throw new AppStudioError('The draft was not saved. Try again.')
  return data.updated_at
}

/**
 * Copies a checked draft to `published`. Conditional on the version the
 * editor saw, so two people publishing at once can't silently overwrite each
 * other: the second is told to reload.
 */
export async function publishDraft(db: Db, tenantId: string, draft: AppStudioDraft, expectedVersion: number, actorId: string): Promise<{ version: number; publishedAt: string }> {
  const now = new Date().toISOString()
  const version = expectedVersion + 1
  const row = { draft: draft as unknown as Json, published: draft as unknown as Json, published_version: version, published_at: now, updated_by: actorId, updated_at: now }
  if (expectedVersion === 0) {
    // First publish: the row may not exist yet (nothing saved as a draft before).
    const existing = await db.from('tenant_app_configs').select('published_version').eq('tenant_id', tenantId).maybeSingle()
    failIf(existing.error, 'publish')
    if (!existing.data) {
      const inserted = await db.from('tenant_app_configs').insert({ tenant_id: tenantId, ...row }).select('published_at').single()
      if (inserted.error?.code === '23505') throw new AppStudioError('Someone else just published. Reload to see their version.')
      failIf(inserted.error, 'publish')
      return { version, publishedAt: inserted.data?.published_at ?? now }
    }
  }
  const { data, error } = await db
    .from('tenant_app_configs')
    .update(row)
    .eq('tenant_id', tenantId)
    .eq('published_version', expectedVersion)
    .select('published_at')
    .maybeSingle()
  failIf(error, 'publish')
  if (!data) throw new AppStudioError('Someone else just published. Reload to see their version.')
  return { version, publishedAt: data.published_at ?? now }
}

/** Throws the unsaved edits away: the draft becomes what is published. */
export async function discardDraft(db: Db, tenantId: string, actorId: string): Promise<void> {
  const { data, error } = await db
    .from('tenant_app_configs')
    .select('published')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  failIf(error, 'discard the draft')
  if (!data) return
  const updated = await db
    .from('tenant_app_configs')
    .update({ draft: (data.published ?? {}) as Json, updated_by: actorId, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .select('tenant_id')
    .maybeSingle()
  failIf(updated.error, 'discard the draft')
  if (!updated.data) throw new AppStudioError('This app no longer exists. Reload the page.')
}
