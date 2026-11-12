/** The real side effects behind `runOrderUpdate` (service role: the caller is a database trigger). */

import 'server-only'
import { writeChatLog } from './chat-log-store'
import { messengerDb } from './service-db'
import { getTenantActivePageById } from '@/lib/facebook/page-tokens'
import { ORDER_BACKEND_TENANT_COLUMNS, resolveOrderBackend, type OrderBackendTenantFields } from '@/lib/order-backend'
import { toCentavos } from './chat-cart'
import type { OrderUpdateDeps } from './order-update'
import { readOrderUpdates } from './order-view'
import { readMessages } from './messages/stored'
import { readOrderTypeKinds, trackingUrl } from './recent-orders'
import { maskPsid, sendMessages } from './send'
import { storeBaseUrl } from './store-view'

export function createOrderUpdateDeps(): OrderUpdateDeps {
  const admin = messengerDb()
  return {
    now: () => new Date(),
    readOrder: async (orderId) => {
      const { data, error } = await admin
        .from('orders')
        .select('id, tenant_id, status, daily_number, order_type, order_type_id, total, customer_data')
        .eq('id', orderId)
        .maybeSingle()
      if (error) throw new Error(`order not readable: ${error.code}`)
      if (!data) return null
      const row = data as {
        id: string; tenant_id: string; status: string; daily_number: number | null; order_type: string | null
        order_type_id: string | null; total: number; customer_data: Record<string, unknown> | null
      }
      const psid = row.customer_data?.messenger_psid
      return {
        id: row.id,
        tenantId: row.tenant_id,
        status: row.status,
        dailyNumber: row.daily_number,
        orderType: row.order_type,
        orderTypeId: row.order_type_id,
        totalCentavos: toCentavos(Number(row.total) || 0),
        psid: typeof psid === 'string' && /^\d{5,32}$/.test(psid) ? psid : null,
      }
    },
    claim: async ({ orderId, status, tenantId }) => {
      const { data, error } = await admin
        .from('messenger_order_updates')
        .upsert({ order_id: orderId, status, tenant_id: tenantId } as never, { onConflict: 'order_id,status', ignoreDuplicates: true })
        .select('order_id')
      if (error) throw new Error(`claim failed: ${error.code}`)
      return (data ?? []).length === 1
    },
    record: async ({ orderId, status, outcome }) => {
      const { error } = await admin
        .from('messenger_order_updates')
        .update({ outcome, updated_at: new Date().toISOString() } as never)
        .eq('order_id', orderId)
        .eq('status', status)
      if (error) console.error('[Messenger order update] outcome not recorded', { code: error.code })
    },
    loadStore: async (tenantId) => {
      const [tenantRead, settingsRead] = await Promise.all([
        admin.from('tenants')
          .select(`name, slug, domain, facebook_page_id, ${ORDER_BACKEND_TENANT_COLUMNS}`)
          .eq('id', tenantId)
          .maybeSingle(),
        admin.from('messenger_settings').select('bot_enabled, order_updates, messages').eq('tenant_id', tenantId).maybeSingle(),
      ])
      if (tenantRead.error || !tenantRead.data) return null
      const tenant = tenantRead.data as { name: string; slug: string; domain: string | null; facebook_page_id: string | null }
      // Unreadable settings: send nothing rather than guess the owner's choice.
      if (settingsRead.error) return null
      const settings = settingsRead.data as { bot_enabled: boolean; order_updates: unknown; messages: unknown } | null
      const orderUpdates = readOrderUpdates(settings?.order_updates ?? null)
      return {
        name: tenant.name.trim(),
        baseUrl: storeBaseUrl(tenant, process.env.PLATFORM_ROOT_DOMAIN ?? null, process.env.NEXT_PUBLIC_APP_URL ?? null),
        isPlatformOrders: resolveOrderBackend(tenantRead.data as OrderBackendTenantFields) === 'platform',
        botEnabled: settings?.bot_enabled ?? true,
        orderUpdates,
        messages: readMessages(settings?.messages ?? null, orderUpdates.texts),
        facebookPageRowId: tenant.facebook_page_id,
      }
    },
    readSession: async (tenantId, psid) => {
      const { data, error } = await admin
        .from('messenger_sessions')
        // `*`: the profile (20261111224021) when present; an older database still answers.
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('psid', psid)
        .maybeSingle()
      if (error || !data) return null
      const row = data as { id: string; last_inbound_at: string | null; bot_paused_until: string | null; first_name?: string | null }
      return {
        id: row.id,
        firstName: row.first_name ?? null,
        lastInboundAt: row.last_inbound_at ? new Date(row.last_inbound_at) : null,
        botPausedUntil: row.bot_paused_until ? new Date(row.bot_paused_until) : null,
      }
    },
    readOrderTypeKind: async (orderTypeId) => (await readOrderTypeKinds([orderTypeId])).get(orderTypeId) ?? null,
    findPageToken: async (tenantId, pageRowId) => (await getTenantActivePageById(tenantId, pageRowId))?.page_access_token ?? null,
    trackingUrl,
    logChat: writeChatLog,
    send: async (token, psid, messages) => {
      const result = await sendMessages(token, psid, messages, fetch, 'UPDATE')
      if (!result.ok) console.error('[Messenger order update] not sent', { psid: maskPsid(psid), code: result.error.code })
      return result
    },
  }
}
