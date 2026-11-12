'use server'

/**
 * App Studio (superadmin): each store's customer app — identity, App Review
 * sign-in, Home (draft → publish), store listing, release.
 *
 * Server Actions are public POST endpoints whatever the page gate says, so
 * every one asserts its console grant (`customer_apps.*`) first and parses its
 * input as `unknown`. Writes use the service role (`tenant_apps` and
 * `tenant_app_configs` are closed to every client role).
 */
import { revalidatePath, revalidateTag } from 'next/cache'
import { customerAppTag } from '@/lib/app-api/tenant-app'
import { appPublishedConfigSchema } from '@/lib/app-api/project-config'
import { checkDraftForPublish } from '@/lib/app-studio/home-draft'
import {
  appIdentityInputSchema,
  appListingInputSchema,
  appReleaseInputSchema,
  firstIssue,
  reviewPhoneSchema,
} from '@/lib/app-studio/inputs'
import { loadAppStudioStore } from '@/lib/app-studio/preview-input'
import {
  AppStudioError,
  clearReviewCode,
  createApp,
  discardDraft,
  issueReviewCode,
  listApps,
  publishDraft,
  readApp,
  saveDraft,
  saveIdentity,
  saveListing,
  saveRelease,
  type AppStudioApp,
  type AppStudioListRow,
} from '@/lib/app-studio/service'
import { getTenantBranding } from '@/lib/branding-utils'
import { loadLoyaltyClaimCrypto } from '@/lib/loyalty/server-keys'
import { requirePlatformPermission } from '@/lib/platform-staff/guard'
import { storefrontTenantIdTag } from '@/lib/storefront/cached-read'
import { createAdminClient } from '@/lib/supabase/admin'

const LIST_PATH = '/superadmin/apps'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type AppStudioResult<T> = { ok: true; data: T } | { ok: false; error: string }

const db = () => createAdminClient()

function tenantIdOf(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new AppStudioError('That store was not found.')
  return value.toLowerCase()
}

/** Known refusals keep their words; anything else is logged and said plainly. */
async function run<T>(work: () => Promise<T>): Promise<AppStudioResult<T>> {
  try {
    return { ok: true, data: await work() }
  } catch (error) {
    if (error instanceof AppStudioError) return { ok: false, error: error.message }
    console.error('[app-studio] action failed', { message: error instanceof Error ? error.message : String(error) })
    return { ok: false, error: 'Something went wrong. Please try again.' }
  }
}

/** The app's lookup is cached per bundle id / package: a change of status, version or id must reach it now. */
function refreshAppLookup(...ids: (string | null | undefined)[]) {
  for (const id of ids) if (id) revalidateTag(customerAppTag(id))
}

export async function listAppStudioAppsAction(): Promise<AppStudioListRow[]> {
  await requirePlatformPermission('customer_apps.view')
  return listApps(db())
}

/** Stores without an app yet, for "Set up an app". */
export async function listStoresWithoutAppAction(): Promise<{ id: string; name: string; slug: string }[]> {
  await requirePlatformPermission('customer_apps.view')
  const client = db()
  const [stores, apps] = await Promise.all([
    client.from('tenants').select('id, name, slug').eq('is_active', true).order('name').limit(2000),
    client.from('tenant_apps').select('tenant_id').limit(2000),
  ])
  if (stores.error) throw new Error(stores.error.message)
  if (apps.error) throw new Error(apps.error.message)
  const taken = new Set((apps.data ?? []).map((row) => row.tenant_id))
  return (stores.data ?? []).filter((store) => !taken.has(store.id))
}

export async function createAppStudioAppAction(tenantId: unknown): Promise<AppStudioResult<AppStudioApp>> {
  await requirePlatformPermission('customer_apps.edit')
  return run(async () => {
    const id = tenantIdOf(tenantId)
    const { data: tenant } = await db().from('tenants').select('*').eq('id', id).maybeSingle()
    const brand = tenant ? getTenantBranding(tenant as Record<string, unknown>).buttonPrimary : null
    const splash = typeof brand === 'string' && /^#[0-9A-Fa-f]{6}$/.test(brand) ? brand : null
    const app = await createApp(db(), id, splash)
    revalidatePath(LIST_PATH)
    return app
  })
}

export async function saveAppIdentityAction(tenantId: unknown, input: unknown): Promise<AppStudioResult<AppStudioApp>> {
  await requirePlatformPermission('customer_apps.edit')
  return run(async () => {
    const id = tenantIdOf(tenantId)
    const parsed = appIdentityInputSchema.safeParse(input)
    if (!parsed.success) throw new AppStudioError(firstIssue(parsed.error))
    const current = await readApp(db(), id)
    if (!current) throw new AppStudioError('This app no longer exists. Reload the page.')
    const app = await saveIdentity(db(), id, parsed.data, current.app)
    refreshAppLookup(current.app.bundle_id, current.app.android_package, app.bundle_id, app.android_package)
    revalidatePath(LIST_PATH)
    return app
  })
}

export async function saveAppListingAction(tenantId: unknown, input: unknown): Promise<AppStudioResult<AppStudioApp>> {
  await requirePlatformPermission('customer_apps.edit')
  return run(async () => {
    const parsed = appListingInputSchema.safeParse(input)
    if (!parsed.success) throw new AppStudioError(firstIssue(parsed.error))
    return saveListing(db(), tenantIdOf(tenantId), parsed.data)
  })
}

export async function saveAppReleaseAction(tenantId: unknown, input: unknown): Promise<AppStudioResult<AppStudioApp>> {
  await requirePlatformPermission('customer_apps.edit')
  return run(async () => {
    const parsed = appReleaseInputSchema.safeParse(input)
    if (!parsed.success) throw new AppStudioError(firstIssue(parsed.error))
    const app = await saveRelease(db(), tenantIdOf(tenantId), parsed.data)
    refreshAppLookup(app.bundle_id, app.android_package)
    revalidatePath(LIST_PATH)
    return app
  })
}

/** A new App Review code for the review number. The code is in this answer only; the database keeps its hash. */
export async function issueAppReviewCodeAction(tenantId: unknown, phone: unknown): Promise<AppStudioResult<{ app: AppStudioApp; code: string }>> {
  await requirePlatformPermission('customer_apps.edit')
  return run(async () => {
    const parsed = reviewPhoneSchema.safeParse(phone)
    if (!parsed.success) throw new AppStudioError(firstIssue(parsed.error))
    const crypto = loadLoyaltyClaimCrypto()
    if (!crypto) throw new AppStudioError('Sign-in keys are not set on this deployment, so a review code can’t be made here.')
    return issueReviewCode(db(), tenantIdOf(tenantId), parsed.data, crypto)
  })
}

export async function clearAppReviewCodeAction(tenantId: unknown): Promise<AppStudioResult<AppStudioApp>> {
  await requirePlatformPermission('customer_apps.edit')
  return run(() => clearReviewCode(db(), tenantIdOf(tenantId)))
}

export async function saveAppDraftAction(tenantId: unknown, draft: unknown): Promise<AppStudioResult<{ savedAt: string }>> {
  const caller = await requirePlatformPermission('customer_apps.edit')
  return run(async () => {
    const parsed = appPublishedConfigSchema.safeParse(draft)
    if (!parsed.success) throw new AppStudioError(firstIssue(parsed.error))
    return { savedAt: await saveDraft(db(), tenantIdOf(tenantId), parsed.data, caller.user.id) }
  })
}

/**
 * Checks the draft against the live store exactly as the app will receive it,
 * then publishes it. `expectedVersion` is the version the editor loaded.
 */
export async function publishAppDraftAction(
  tenantId: unknown,
  draft: unknown,
  expectedVersion: unknown,
): Promise<AppStudioResult<{ version: number; publishedAt: string }>> {
  const caller = await requirePlatformPermission('customer_apps.edit')
  return run(async () => {
    const id = tenantIdOf(tenantId)
    if (typeof expectedVersion !== 'number' || !Number.isInteger(expectedVersion) || expectedVersion < 0) throw new AppStudioError('Reload the page and try again.')
    const { data: tenant } = await db().from('tenants').select('slug').eq('id', id).maybeSingle()
    const store = tenant ? await loadAppStudioStore(tenant.slug) : null
    if (!store) throw new AppStudioError('The store could not be read. Try again in a moment.')
    const checked = checkDraftForPublish(draft, store.configInput)
    if (!checked.ok) throw new AppStudioError(checked.error)
    const published = await publishDraft(db(), id, checked.draft, expectedVersion, caller.user.id)
    // The config route reads `published` through the store's cached reads.
    revalidateTag(storefrontTenantIdTag(id))
    revalidatePath(LIST_PATH)
    return published
  })
}

export async function discardAppDraftAction(tenantId: unknown): Promise<AppStudioResult<null>> {
  const caller = await requirePlatformPermission('customer_apps.edit')
  return run(async () => {
    await discardDraft(db(), tenantIdOf(tenantId), caller.user.id)
    return null
  })
}
