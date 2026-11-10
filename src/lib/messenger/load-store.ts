/**
 * Everything the webhook needs about one store, read with the service role
 * (Meta calls the webhook with no session). Scoped to the one store the Page
 * belongs to.
 *
 * Fails soft: a store whose rules or settings can't be read runs the built-in
 * rules with the bot on, which is exactly what it did before automations.
 */

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStorefrontMenu } from '@/lib/storefront/storefront-menu'
import type { MessengerRule } from './rules'
import { buildReplyStore } from './store-view'
import {
  activeRules, DEFAULT_SETTINGS, rowsToRules, toSettings,
  type MessengerSettings, type RuleRow, type SettingsRow, type StoreBundle,
} from './settings'

export type { MessengerSettings, StoreBundle } from './settings'
export { activeRules, DEFAULT_SETTINGS } from './settings'

const TENANT_COLUMNS = 'id, slug, name, domain, logo_url, operating_hours, timezone, restaurant_address, footer_address, facebook_page_id'

export async function loadMessengerSettingsAndRules(tenantId: string): Promise<{ settings: MessengerSettings; storedRules: MessengerRule[] }> {
  const admin = createAdminClient()
  const [settingsRead, rulesRead] = await Promise.all([
    admin.from('messenger_settings')
      .select('bot_enabled, takeover_minutes, rules_customized_at, rules_version, tester_psid, tester_code_hash, tester_code_expires_at, profile_hash, profile_fields')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    admin.from('messenger_rules')
      .select('id, name, trigger, action, is_enabled')
      .eq('tenant_id', tenantId)
      .order('position', { ascending: true })
      .limit(60),
  ])
  if (settingsRead.error) console.error('[Messenger] settings unreadable, using defaults:', settingsRead.error.message)
  if (rulesRead.error) console.error('[Messenger] rules unreadable, using defaults:', rulesRead.error.message)

  const settings = settingsRead.error ? DEFAULT_SETTINGS : toSettings(settingsRead.data as SettingsRow | null)
  const storedRules = rulesRead.error ? [] : rowsToRules((rulesRead.data ?? []) as RuleRow[])
  // Unreadable rules on a customised store: fall back to the built-ins rather than go silent.
  const useStored = settings.isCustomized && !rulesRead.error
  return { settings: useStored ? settings : { ...settings, isCustomized: false }, storedRules }
}

export async function loadStoreBundle(tenantId: string, now: Date = new Date()): Promise<StoreBundle | null> {
  const { data: tenantRow, error } = await createAdminClient()
    .from('tenants')
    .select(TENANT_COLUMNS)
    .eq('id', tenantId)
    .maybeSingle()
  if (error || !tenantRow) {
    console.error('[Messenger] store not readable', { tenantId, code: error?.code })
    return null
  }
  const tenant = tenantRow as unknown as {
    id: string; slug: string; name: string; domain: string | null; logo_url: string | null
    operating_hours: unknown; timezone: string | null; restaurant_address: string | null; footer_address: string | null
    facebook_page_id: string | null
  }

  const [menu, { settings, storedRules }] = await Promise.all([
    getStorefrontMenu(tenant.slug).catch((menuError: unknown) => {
      console.error('[Messenger] menu not readable', { tenantId, message: menuError instanceof Error ? menuError.message : String(menuError) })
      return null
    }),
    loadMessengerSettingsAndRules(tenant.id),
  ])

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
    store,
    rules: activeRules(settings, storedRules),
    settings,
  }
}
