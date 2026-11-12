import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { APP_ORDER_KINDS } from '@/lib/app-contract'
import { chaseExpoReceipts, describePushFailures, sendExpoPushMessages, staleTokensFrom, type PushFailure } from '@/lib/push/expo-delivery'
import { afterResponse } from '@/lib/push/push-route-helpers'
import { appDb } from '@/lib/app-api/service-db'
import { CUSTOMER_PUSH_INSTALLS_MAX, type CustomerOrderPushMessage } from './order-push-words'
import type { CustomerOrderPushDeps, PushIndexRow } from './run-order-push'

/** The real side effects of `runCustomerOrderPush` (service role; every table is service-only). */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The bits of the placement snapshot the wording needs; anything unreadable
// falls back to the plain wording rather than dropping the push.
const summaryBitsSchema = z.object({
  orderKind: z.enum(APP_ORDER_KINDS).catch('other'),
  number: z.string().min(1).nullable().catch(null),
})

const LOG = '[customer-order-push]'

async function pruneCustomerTokens(admin: SupabaseClient, tenantId: string, failures: readonly PushFailure[]): Promise<void> {
  const stale = staleTokensFrom(failures)
  if (stale.length === 0) return
  const { error } = await admin.from('customer_device_tokens').delete().eq('tenant_id', tenantId).in('expo_token', stale)
  if (error) console.error(`${LOG} stale token cleanup failed`, { message: error.message })
}

export function createCustomerOrderPushDeps(): CustomerOrderPushDeps {
  // Untyped until src/types/supabase.ts is regenerated after 20261112150000.
  const admin = appDb() as unknown as SupabaseClient

  return {
    async readOrder(orderId) {
      if (!UUID.test(orderId)) return null
      const { data, error } = await admin.from('orders').select('id, tenant_id, status').eq('id', orderId).maybeSingle()
      if (error) throw new Error(`order read failed: ${error.message}`)
      if (!data) return null
      return { id: data.id, tenantId: data.tenant_id, status: data.status }
    },

    async readIndexRow(tenantId, orderId): Promise<PushIndexRow | null> {
      const { data, error } = await admin
        .from('customer_app_orders')
        .select('customer_id, state, summary')
        .eq('tenant_id', tenantId)
        .eq('backend', 'platform')
        .eq('order_id', orderId)
        .maybeSingle()
      if (error) throw new Error(`app order index read failed: ${error.message}`)
      if (!data || data.state !== 'placed') return null
      const bits = summaryBitsSchema.safeParse(data.summary ?? {})
      return {
        customerId: data.customer_id,
        orderKind: bits.success ? bits.data.orderKind : 'other',
        number: bits.success ? bits.data.number : null,
      }
    },

    async claim({ orderId, status, tenantId }) {
      const { data, error } = await admin
        .from('customer_app_order_pushes')
        .upsert({ order_id: orderId, status, tenant_id: tenantId }, { onConflict: 'order_id,status', ignoreDuplicates: true })
        .select('order_id')
      if (error) throw new Error(`claim failed: ${error.message}`)
      return (data ?? []).length === 1
    },

    async record({ orderId, status, outcome, devices }) {
      const { error } = await admin.from('customer_app_order_pushes').update({ outcome, devices }).eq('order_id', orderId).eq('status', status)
      if (error) console.error(`${LOG} outcome not recorded`, { message: error.message })
    },

    async readTokens(tenantId, customerId) {
      const { data, error } = await admin
        .from('customer_device_tokens')
        .select('expo_token, customer_app_sessions!inner(revoked_at, expires_at)')
        .eq('tenant_id', tenantId)
        .eq('customer_id', customerId)
        .is('customer_app_sessions.revoked_at', null)
        .gt('customer_app_sessions.expires_at', new Date().toISOString())
        .order('last_seen_at', { ascending: false })
        .limit(CUSTOMER_PUSH_INSTALLS_MAX)
      if (error) throw new Error(`token read failed: ${error.message}`)
      return [...new Set((data ?? []).map((row: { expo_token: string }) => row.expo_token))]
    },

    async readStoreName(tenantId) {
      const { data, error } = await admin.from('tenants').select('name').eq('id', tenantId).maybeSingle()
      if (error) console.error(`${LOG} store name read failed`, { message: error.message })
      return typeof data?.name === 'string' ? data.name : null
    },

    async send(tenantId: string, messages: readonly CustomerOrderPushMessage[]) {
      const result = await sendExpoPushMessages(messages)
      // Receipts and the clean-up of uninstalled phones run after the response.
      void afterResponse(async () => {
        const receipts = await chaseExpoReceipts(result.accepted)
        const failures = [...result.failures, ...receipts.failures]
        const described = describePushFailures(failures)
        if (described) console.error(`${LOG} devices refused`, { tenantId, described })
        await pruneCustomerTokens(admin, tenantId, failures)
      })
      return { accepted: result.accepted.length }
    },
  }
}
