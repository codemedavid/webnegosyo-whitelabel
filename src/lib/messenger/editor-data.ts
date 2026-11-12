/**
 * What the Messenger Studio opens with. Rules and settings are read through
 * the caller's session client (RLS decides); only "is a test chat linked" is
 * read with the service role, as a yes/no — never the PSID.
 */

import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStorefrontMenu } from '@/lib/storefront/storefront-menu'
import type { Tenant } from '@/types/database'
import type { MessengerStudioProps } from '@/components/admin/messenger-studio/messenger-studio'
import { DEFAULT_RULES } from './rules'
import { rowsToRules, type RuleRow } from './settings'
import { buildReplyStore } from './store-view'
import { readOrderUpdates } from './order-view'
import { readMessages } from './messages/stored'
import { resolveOrderBackend, type OrderBackendTenantFields } from '@/lib/order-backend'

type EditorData = { ok: true; props: Omit<MessengerStudioProps, 'tenantId' | 'tenantSlug'> } | { ok: false; error: string }

const UNAVAILABLE = 'Messenger automations aren’t available for this store yet. Please try again later.'

export async function loadAutomationsPageData(tenant: Tenant): Promise<EditorData> {
  const supabase = await createClient()
  const [settingsRead, rulesRead, menu, tester] = await Promise.all([
    supabase.from('messenger_settings')
      .select('bot_enabled, takeover_minutes, rules_customized_at, rules_version, profile_error, order_updates, messages')
      .eq('tenant_id', tenant.id)
      .maybeSingle(),
    supabase.from('messenger_rules')
      .select('id, name, trigger, action, is_enabled')
      .eq('tenant_id', tenant.id)
      .order('position', { ascending: true })
      .limit(60),
    getStorefrontMenu(tenant.slug).catch(() => null),
    createAdminClient().from('messenger_settings').select('tester_psid').eq('tenant_id', tenant.id).maybeSingle(),
  ])

  if (settingsRead.error || rulesRead.error) {
    console.error('[Messenger automations] editor read failed', { tenantId: tenant.id, settings: settingsRead.error?.code, rules: rulesRead.error?.code })
    return { ok: false, error: UNAVAILABLE }
  }

  const settings = settingsRead.data as {
    bot_enabled: boolean; takeover_minutes: number; rules_customized_at: string | null; rules_version: number; profile_error: string | null
    order_updates: unknown; messages: unknown
  } | null
  const orderUpdates = readOrderUpdates(settings?.order_updates ?? null)
  const isCustomized = Boolean(settings?.rules_customized_at)
  const store = buildReplyStore({
    tenant,
    categories: menu?.status === 'ready' ? menu.categories : [],
    menuItems: menu?.status === 'ready' ? menu.menuItems : [],
    rootDomain: process.env.PLATFORM_ROOT_DOMAIN ?? null,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
    now: new Date(),
  })
  if (!store) return { ok: false, error: UNAVAILABLE }

  return {
    ok: true,
    props: {
      initialRules: isCustomized ? rowsToRules((rulesRead.data ?? []) as RuleRow[]) : [...DEFAULT_RULES],
      isCustomized,
      version: settings?.rules_version ?? 0,
      botEnabled: settings?.bot_enabled ?? true,
      takeoverMinutes: settings?.takeover_minutes ?? 60,
      store,
      isPageConnected: Boolean(tenant.facebook_page_id),
      isTesterLinked: Boolean((tester.data as { tester_psid: string | null } | null)?.tester_psid),
      profileError: settings?.profile_error ?? null,
      orderUpdates,
      messages: readMessages(settings?.messages ?? null, orderUpdates.texts),
      isPlatformOrders: resolveOrderBackend(tenant as OrderBackendTenantFields) === 'platform',
    },
  }
}
