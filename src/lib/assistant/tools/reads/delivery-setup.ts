/**
 * get_delivery_setup — step-by-step: is this store ready to book Lalamove
 * riders, and what to do next. Owner-only, like the Lalamove card in
 * Settings → Delivery. Only a "keys saved: yes/no" ever leaves the server.
 */

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTenantSecrets } from '@/lib/tenant-secrets'
import { evaluateDeliverySetup, type DeliverySetup } from '@/lib/assistant/insights/delivery-setup'
import type { AssistantToolDef } from '@/lib/assistant/tools/registry'
import type { ToolResult } from '@/lib/assistant/types'

const input = z.object({})
type Input = z.infer<typeof input>

const WEEK_MS = 7 * 86_400_000
const STATE_LABEL = { done: 'Done', todo: 'To do', blocked: 'Waiting' } as const

interface TenantRow {
  lalamove_enabled: boolean | null
  lalamove_market: string | null
  lalamove_sandbox: boolean | null
  lalamove_sender_phone: string | null
  footer_phone: string | null
  restaurant_latitude: number | null
  restaurant_longitude: number | null
}

async function hasKeys(tenantId: string): Promise<boolean | null> {
  try {
    const secrets = await getTenantSecrets(createAdminClient(), tenantId)
    return Boolean(secrets?.lalamove_api_key && secrets?.lalamove_secret_key)
  } catch {
    return null
  }
}

export function buildDeliverySetupResult(setup: DeliverySetup, keysUnreadable: boolean): ToolResult {
  return {
    facts: {
      ready: setup.ready,
      steps: setup.steps.map((step) => ({ step: step.label, state: step.state, next: step.next })),
      environment: setup.environment,
      ...(keysUnreadable ? { note: 'Whether keys are saved could not be checked.' } : {}),
      bookingsLast7Days: setup.bookings ?? 'unavailable',
      rule: 'Never ask for or accept Lalamove keys in chat; they go in Settings → Delivery.',
    },
    card: {
      type: 'ranked',
      title: setup.ready ? 'Lalamove is ready' : 'Lalamove set-up',
      subtitle: setup.environment === 'sandbox' ? 'Test (sandbox) keys — riders are not real' : setup.bookings ? `${setup.bookings.total} bookings in 7 days` : undefined,
      rows: setup.steps.map((step) => ({ label: step.label, value: STATE_LABEL[step.state], detail: step.next ?? undefined, badge: step.state === 'done' ? undefined : STATE_LABEL[step.state] })),
    },
    links: [{ label: 'Open Delivery settings', path: '/settings/delivery' }],
  }
}

export const getDeliverySetupTool: AssistantToolDef<Input> = {
  name: 'get_delivery_setup',
  description: 'Lalamove rider booking: is the store set up (switched on, keys saved, rider phone, pickup pin, delivery on) and what to do next.',
  access: { ownerOnly: true },
  input,
  async run(ctx) {
    const db = createAdminClient() as unknown as SupabaseClient
    const since = new Date(Date.now() - WEEK_MS).toISOString()
    // Bookings are counted only where the store's orders really live (CLAUDE.md:
    // route through resolveOrderBackend); elsewhere they read as unavailable, never 0.
    const countBookings = ctx.flags.isPlatformOrders === true
    const [tenant, outlets, deliveryTypes, bookings, keys] = await Promise.all([
      db
        .from('tenants')
        .select('lalamove_enabled, lalamove_market, lalamove_sandbox, lalamove_sender_phone, footer_phone, restaurant_latitude, restaurant_longitude')
        .eq('id', ctx.tenantId)
        .maybeSingle(),
      db.from('outlets').select('latitude, longitude, is_active').eq('tenant_id', ctx.tenantId).limit(200),
      db.from('order_types').select('id').eq('tenant_id', ctx.tenantId).eq('type', 'delivery').eq('is_enabled', true).limit(1),
      countBookings
        ? db
            .from('orders')
            .select('lalamove_status')
            .eq('tenant_id', ctx.tenantId)
            .not('lalamove_order_id', 'is', null)
            .gte('created_at', since)
            .limit(1000)
        : Promise.resolve({ data: null, error: 'not a platform-orders store' }),
      hasKeys(ctx.tenantId),
    ])
    const row = tenant.data as TenantRow | null
    if (tenant.error || !row) return { facts: { available: false, reason: 'Delivery settings could not be read.' } }

    const activeOutlets = ((outlets.data ?? []) as Array<{ latitude: number | null; longitude: number | null; is_active: boolean | null }>).filter((outlet) => outlet.is_active !== false)
    const setup = evaluateDeliverySetup({
      lalamoveEnabled: row.lalamove_enabled === true,
      market: row.lalamove_market,
      isSandbox: row.lalamove_sandbox === true,
      hasKeys: keys === true,
      senderPhone: row.lalamove_sender_phone,
      footerPhone: row.footer_phone,
      storePinned: row.restaurant_latitude !== null && row.restaurant_longitude !== null,
      branches: { total: activeOutlets.length, pinned: activeOutlets.filter((outlet) => outlet.latitude !== null && outlet.longitude !== null).length },
      deliveryOrderTypeOn: (deliveryTypes.data ?? []).length > 0,
      recentStatuses: !countBookings || bookings.error ? null : ((bookings.data ?? []) as Array<{ lalamove_status: string | null }>).map((booking) => booking.lalamove_status),
    })
    return buildDeliverySetupResult(setup, keys === null)
  },
}
