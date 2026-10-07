/**
 * The three reads `createOrderAction` opens with, issued together.
 *
 * The tenant row (routing, feature flags, delivery inputs), its secrets (the
 * Convex deploy key and the Loyverse token) and the chosen order type need no
 * answer from one another, yet ran one after another on the path of every
 * order. They now leave in one batch.
 *
 * The answers are still judged in the original order, so no refusal changes:
 *  1. an inactive (or unknown) store is refused first — a secrets failure
 *     arriving alongside must not turn that refusal into a "lost order";
 *  2. a secrets failure for an active store throws, as before (the caller's
 *     catch reports the order lost — it cannot be routed);
 *  3. the order type is handed back as a settled-later promise, because the
 *     action judges it AFTER its add-on stock check, exactly where it always
 *     read it.
 */

import { getTenantSecrets, type TenantSecrets } from '@/lib/tenant-secrets'
import { CHECKOUT_ORDER_TYPE_SELECT, type CheckoutOrderTypeRow } from '@/lib/checkout/checkout-order-type'
import type { createAdminClient } from '@/lib/supabase/admin'
import { OPERATING_HOURS_ENFORCEMENT_COLUMNS } from '@/lib/store-open-status'

type AdminClient = ReturnType<typeof createAdminClient>

/** Every tenant column the order action consults. Credentials live in tenant_secrets. */
export const ORDER_TENANT_CONFIG_SELECT = [
  'order_backend', 'supabase_order_url', 'supabase_order_anon_key', 'supabase_order_service_key',
  'inventory_enabled', 'convex_deployment_url', 'admin_email', 'email_notifications_enabled',
  'name', 'slug', 'is_active', 'lalamove_enabled', 'distance_delivery_enabled',
  'delivery_price_per_km', 'delivery_min_fee', 'delivery_radius_km', 'free_delivery_min_order',
  'restaurant_latitude', 'restaurant_longitude', 'multi_branch_enabled',
  'loyverse_enabled', 'loyverse_store_id', 'loyverse_payment_type_id', 'loyverse_push_mode',
  // Operating hours + pre-launch: the action refuses a closed store itself, on
  // every backend, so the refusal is marked as one (see store-open-status.ts).
  ...OPERATING_HOURS_ENFORCEMENT_COLUMNS,
].join(', ')

export type OrderTypeRead = { ok: true; row: CheckoutOrderTypeRow | null } | { ok: false }

export type OrderTenantContext =
  | { ok: false }
  | {
      ok: true
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tenantConfig: Record<string, any>
      tenantSecrets: TenantSecrets | null
      /** Already in flight; await it where the order type is judged. */
      orderType: Promise<OrderTypeRead>
    }

const NO_ORDER_TYPE: OrderTypeRead = { ok: true, row: null }

async function readOrderType(client: AdminClient, tenantId: string, orderTypeId?: string): Promise<OrderTypeRead> {
  if (!orderTypeId) return NO_ORDER_TYPE
  const { data, error } = await client
    .from('order_types')
    .select(CHECKOUT_ORDER_TYPE_SELECT)
    .eq('id', orderTypeId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) return { ok: false }
  return { ok: true, row: (data as CheckoutOrderTypeRow | null) ?? null }
}

/** Swallow a rejection until the caller awaits the promise in its own turn. */
function deferRejection<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => {})
  return promise
}

export async function loadOrderTenantContext(
  client: AdminClient,
  tenantId: string,
  orderTypeId?: string,
): Promise<OrderTenantContext> {
  // `is_active` keeps a deactivated store from taking orders.
  const configRead = client
    .from('tenants')
    .select(ORDER_TENANT_CONFIG_SELECT)
    .eq('id', tenantId)
    .eq('is_active', true)
    .single()
  const secretsRead = deferRejection(getTenantSecrets(client, tenantId))
  const orderType = deferRejection(readOrderType(client, tenantId, orderTypeId))

  const { data: configData } = await configRead
  if (!configData) return { ok: false }

  const tenantSecrets = await secretsRead
  return {
    ok: true,
    tenantConfig: {
      ...(configData as unknown as Record<string, unknown>),
      convex_deploy_key: tenantSecrets?.convex_deploy_key ?? null,
    },
    tenantSecrets,
    orderType,
  }
}
