/**
 * Everything the webhook needs about one store, read with the service role
 * (Meta calls the webhook with no session). Scoped to the one store the Page
 * belongs to.
 *
 * Fails soft: a store whose rules or settings can't be read runs the built-in
 * rules with the bot on, which is exactly what it did before automations.
 */

import 'server-only'
import { revalidateTag } from 'next/cache'
import { createCachedRead, doNotCache, projectionCacheKey, storefrontTenantIdTag, type Uncached } from '@/lib/storefront/cached-read'
import { messengerDb } from './service-db'
import { getStorefrontMenu } from '@/lib/storefront/storefront-menu'
import { ORDER_BACKEND_TENANT_COLUMNS, resolveOrderBackend, type OrderBackendTenantFields } from '@/lib/order-backend'
import type { MessengerRule } from './rules'
import { buildReplyStore } from './store-view'
import { DEFAULT_MESSAGE_SETTINGS, type MessageSettings } from './messages/registry'
import { readMessages } from './messages/stored'
import { readOrderUpdates } from './order-view'
import {
  activeRules, DEFAULT_SETTINGS, rowsToRules, toSettings,
  type MessengerSettings, type RuleRow, type SettingsRow, type StoreBundle,
} from './settings'

export type { MessengerSettings, StoreBundle } from './settings'
export { activeRules, DEFAULT_SETTINGS } from './settings'

const TENANT_COLUMNS = `id, slug, name, domain, logo_url, operating_hours, timezone, restaurant_address, footer_address, facebook_page_id, ${ORDER_BACKEND_TENANT_COLUMNS}`
/** Everything the bot reads from `messenger_settings` except the test-link fields. */
const SHARED_SETTINGS_COLUMNS = 'bot_enabled, takeover_minutes, rules_customized_at, rules_version, profile_hash, profile_fields, messages, order_updates'
const TESTER_COLUMNS = 'tester_psid, tester_code_hash, tester_code_expires_at'
const RULE_COLUMNS = 'id, name, trigger, action, is_enabled'

type TenantRow = {
  id: string; slug: string; name: string; domain: string | null; logo_url: string | null
  operating_hours: unknown; timezone: string | null; restaurant_address: string | null; footer_address: string | null
  facebook_page_id: string | null
} & OrderBackendTenantFields

/** The raw rows, so they can sit in the data cache (JSON only: no Dates). */
interface ConfigRows {
  settings: SettingsRow | null
  rules: RuleRow[]
  settingsFailed: boolean
  rulesFailed: boolean
}

async function readConfigRows(tenantId: string, settingsColumns: string): Promise<ConfigRows> {
  const admin = messengerDb()
  const [settingsRead, rulesRead] = await Promise.all([
    admin.from('messenger_settings').select(settingsColumns).eq('tenant_id', tenantId).maybeSingle(),
    admin.from('messenger_rules')
      .select(RULE_COLUMNS)
      .eq('tenant_id', tenantId)
      .order('position', { ascending: true })
      .limit(60),
  ])
  if (settingsRead.error) console.error('[Messenger] settings unreadable, using defaults:', settingsRead.error.message)
  if (rulesRead.error) console.error('[Messenger] rules unreadable, using defaults:', rulesRead.error.message)
  return {
    settings: settingsRead.error ? null : (settingsRead.data as unknown as SettingsRow | null),
    rules: rulesRead.error ? [] : ((rulesRead.data ?? []) as unknown as RuleRow[]),
    settingsFailed: Boolean(settingsRead.error),
    rulesFailed: Boolean(rulesRead.error),
  }
}

function configFromRows(rows: ConfigRows): { settings: MessengerSettings; storedRules: MessengerRule[] } {
  const settings = rows.settingsFailed ? DEFAULT_SETTINGS : toSettings(rows.settings)
  const storedRules = rowsToRules(rows.rules)
  // Unreadable rules on a customised store: fall back to the built-ins rather than go silent.
  const useStored = settings.isCustomized && !rows.rulesFailed
  return { settings: useStored ? settings : { ...settings, isCustomized: false }, storedRules }
}

export async function loadMessengerSettingsAndRules(tenantId: string): Promise<{ settings: MessengerSettings; storedRules: MessengerRule[] }> {
  return configFromRows(await readConfigRows(tenantId, `${SHARED_SETTINGS_COLUMNS}, ${TESTER_COLUMNS}`))
}

/**
 * Only the store's message wording (Studio → Messages), for texts the website
 * sends (cart, order summary). One indexed row; unreadable = the built-in
 * words, never a failed send.
 */
export async function loadMessageSettings(tenantId: string): Promise<MessageSettings> {
  const { data, error } = await messengerDb()
    .from('messenger_settings')
    .select('messages, order_updates')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) console.error('[Messenger] message wording unreadable, using defaults:', error.message)
  if (error || !data) return DEFAULT_MESSAGE_SETTINGS
  const row = data as { messages: unknown; order_updates: unknown }
  return readMessages(row.messages, readOrderUpdates(row.order_updates ?? null).texts)
}

async function readTenantRow(tenantId: string): Promise<TenantRow | null> {
  const { data, error } = await messengerDb()
    .from('tenants')
    .select(TENANT_COLUMNS)
    .eq('id', tenantId)
    .maybeSingle()
  if (error || !data) {
    console.error('[Messenger] store not readable', { tenantId, code: error?.code })
    return null
  }
  return data as unknown as TenantRow
}

async function assembleBundle(tenant: TenantRow, config: ConfigRows, now: Date): Promise<StoreBundle> {
  const { settings, storedRules } = configFromRows(config)
  const menu = await getStorefrontMenu(tenant.slug).catch((menuError: unknown) => {
    console.error('[Messenger] menu not readable', { tenantId: tenant.id, message: menuError instanceof Error ? menuError.message : String(menuError) })
    return null
  })

  const isMenuReady = menu?.status === 'ready'
  const store = buildReplyStore({
    tenant,
    categories: isMenuReady ? menu.categories : [],
    menuItems: isMenuReady ? menu.menuItems : [],
    rootDomain: process.env.PLATFORM_ROOT_DOMAIN ?? null,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
    now,
  })

  return {
    tenantId: tenant.id,
    slug: tenant.slug,
    facebookPageRowId: tenant.facebook_page_id,
    isPlatformOrders: resolveOrderBackend(tenant as OrderBackendTenantFields) === 'platform',
    store,
    rules: activeRules(settings, storedRules),
    settings,
  }
}

/** Every read fresh: the editor, test sends, staff replies, the website's cart text. */
export async function loadStoreBundle(tenantId: string, now: Date = new Date()): Promise<StoreBundle | null> {
  const [tenant, config] = await Promise.all([
    readTenantRow(tenantId),
    readConfigRows(tenantId, `${SHARED_SETTINGS_COLUMNS}, ${TESTER_COLUMNS}`),
  ])
  return tenant ? assembleBundle(tenant, config, now) : null
}

// ── The webhook's cached copy ────────────────────────────────────────────────
// Every customer message used to read the store row, the bot settings and the
// rules again (3 queries on the shared database per message). They change only
// when the owner saves, so the webhook keeps them in the data cache, like the
// storefront menu: one read per store per 5 minutes, dropped at once by any
// Messenger save (`revalidateMessengerConfig`) and by any store write that
// already refreshes the storefront (`revalidateStorefront` purges the tenant-id
// tag). The test-link fields are never cached: a fresh code must work at once,
// so the webhook reads them only for a message that looks like a code.

export function messengerConfigTag(tenantId: string): string {
  return `messenger-config:${tenantId}`
}

/** After any write to `messenger_settings` / `messenger_rules`. Server Actions and Route Handlers only. */
export function revalidateMessengerConfig(tenantId: string): void {
  revalidateTag(messengerConfigTag(tenantId))
}

export const MESSENGER_CONFIG_CACHE_SECONDS = 300

interface CachedStoreRows {
  tenant: TenantRow
  config: ConfigRows
}

async function readStoreRowsForCache(tenantId: string): Promise<CachedStoreRows | null | Uncached<CachedStoreRows | null>> {
  const [tenant, config] = await Promise.all([readTenantRow(tenantId), readConfigRows(tenantId, SHARED_SETTINGS_COLUMNS)])
  // A failed or missing read reaches this message but never the cache.
  if (!tenant) return doNotCache(null)
  const rows: CachedStoreRows = { tenant, config }
  return config.settingsFailed || config.rulesFailed ? doNotCache(rows) : rows
}

const readCachedStoreRows = createCachedRead(
  ['messenger-store-rows', projectionCacheKey(`${TENANT_COLUMNS}|${SHARED_SETTINGS_COLUMNS}|${RULE_COLUMNS}`)],
  readStoreRowsForCache,
  {
    tags: (tenantId) => [messengerConfigTag(tenantId), storefrontTenantIdTag(tenantId)],
    revalidate: MESSENGER_CONFIG_CACHE_SECONDS,
  },
)

/** `loadStoreBundle` for the webhook: same bundle, rows from the cache, no test-link fields. */
export async function loadCachedStoreBundle(tenantId: string, now: Date = new Date()): Promise<StoreBundle | null> {
  const rows = await readCachedStoreRows(tenantId)
  return rows ? assembleBundle(rows.tenant, rows.config, now) : null
}

/** The staff-takeover setting for a staff reply in Page Inbox, from the same cached rows. */
export async function loadCachedTakeoverMinutes(tenantId: string): Promise<number> {
  const rows = await readCachedStoreRows(tenantId)
  return rows ? configFromRows(rows.config).settings.takeoverMinutes : DEFAULT_SETTINGS.takeoverMinutes
}

/** The pending "TEST 123456" code, read fresh. Unreadable = no code (the owner gets a new one). */
export async function loadTesterCode(tenantId: string): Promise<{ hash: string | null; expiresAt: Date | null }> {
  const { data, error } = await messengerDb()
    .from('messenger_settings')
    .select('tester_code_hash, tester_code_expires_at')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) console.error('[Messenger] test code unreadable', { tenantId, code: error.code })
  const row = error ? null : (data as { tester_code_hash: string | null; tester_code_expires_at: string | null } | null)
  return {
    hash: row?.tester_code_hash ?? null,
    expiresAt: row?.tester_code_expires_at ? new Date(row.tester_code_expires_at) : null,
  }
}
