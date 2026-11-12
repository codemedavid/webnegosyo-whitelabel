import 'server-only'
import type { NextResponse } from 'next/server'
import { appDeliveryQuoteRequestSchema } from '@/lib/app-contract'
import type { AppRouteContext } from '@/lib/app-api/app-route'
import { readAppJson } from '@/lib/app-api/request-body'
import { appFail, appOk } from '@/lib/app-api/respond'
import { AppReadError, readAppOrderTypes } from '@/lib/app-api/store-reads'
import { checkRateLimit } from '@/lib/distributed-rate-limit'
import { ORIGIN_OUTLET_COLUMNS, ORIGIN_TENANT_COLUMNS } from '@/lib/delivery/delivery-origin-server'
import {
  LALAMOVE_TENANT_COLUMNS,
  LALAMOVE_TENANT_QUOTE_LIMIT,
  createSignedLalamoveQuote,
  lalamoveQuoteRateKey,
  withLalamoveKeys,
} from '@/lib/delivery/lalamove-signed-quote'
import { measureRoadDistanceKm } from '@/lib/maps/road-distance-server'
import { ADMIN_QUERY_TIMEOUT_MS, createAdminClient } from '@/lib/supabase/admin'
import type { Tenant } from '@/types/database'
import { gateAppCustomer, type CustomerBudgets } from './customer-gate'
import { quoteAppDelivery, type DeliveryQuoteDeps, type DeliveryQuoteOutlet, type DeliveryQuoteTenant } from './quote'

/**
 * POST /api/app/v1/delivery/quote — HTTP + the live reads behind `quoteAppDelivery`.
 * Every Lalamove quote is billed to the store's own account, so a customer
 * gets a small budget and the store-wide cap is the web checkout's
 * (`lalamove-quote:<tenant>`), shared with it.
 */

export const QUOTE_BUDGETS: CustomerBudgets = {
  bucket: 'app-delivery-quote',
  burst: { limit: 10, windowSec: 60 },
  daily: { limit: 100, windowSec: 86_400 },
}

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const BAD_ADDRESS = 'Choose your delivery address from the suggestions.'

/** Named columns only: the Lalamove ones plus pricing. Never `*` (secrets). */
const QUOTE_TENANT_COLUMNS =
  `${LALAMOVE_TENANT_COLUMNS}, ${ORIGIN_TENANT_COLUMNS}, ` +
  'distance_delivery_enabled, delivery_price_per_km, delivery_min_fee, free_delivery_min_order'

const MAX_OUTLETS = 500

const admin = () => createAdminClient({ timeoutMs: ADMIN_QUERY_TIMEOUT_MS })

async function readQuoteTenant(tenantId: string): Promise<(DeliveryQuoteTenant & Record<string, unknown>) | null> {
  const { data, error } = await admin().from('tenants').select(QUOTE_TENANT_COLUMNS).eq('id', tenantId).maybeSingle()
  if (error) throw new AppReadError('delivery pricing', error.message)
  return (data as unknown as DeliveryQuoteTenant & Record<string, unknown>) ?? null
}

async function readQuoteOutlets(tenantId: string): Promise<DeliveryQuoteOutlet[]> {
  const { data, error } = await admin()
    .from('outlets')
    .select(`${ORIGIN_OUTLET_COLUMNS}, name, is_active, supports_delivery`)
    .eq('tenant_id', tenantId)
    .limit(MAX_OUTLETS)
  if (error) throw new AppReadError('branches', error.message)
  return (data ?? []) as unknown as DeliveryQuoteOutlet[]
}

/** Reads the tenant once per request; the Lalamove dep reuses that row for its keys. */
function liveDeps(): DeliveryQuoteDeps {
  let tenantRow: Promise<(DeliveryQuoteTenant & Record<string, unknown>) | null> | null = null
  const readTenant = (tenantId: string) => (tenantRow ??= readQuoteTenant(tenantId))
  return {
    readTenant,
    readOutlets: readQuoteOutlets,
    readOrderTypeKinds: async (tenantId) => (await readAppOrderTypes(tenantId)).map((orderType) => orderType.type),
    measureKm: measureRoadDistanceKm,
    quoteLalamove: async (tenantId, origin, destination) => {
      const rate = await checkRateLimit(lalamoveQuoteRateKey(tenantId), { ...LALAMOVE_TENANT_QUOTE_LIMIT, onRedisFailure: 'instance' })
      if (!rate.allowed) return { ok: false, reason: 'rate-limited', retryAfterSec: rate.retryAfterSec }
      const row = await readTenant(tenantId)
      if (!row) throw new AppReadError('delivery pricing', 'store row vanished')
      return createSignedLalamoveQuote(await withLalamoveKeys(row as unknown as Tenant), origin, destination)
    },
  }
}

export async function handleDeliveryQuote(context: AppRouteContext): Promise<NextResponse> {
  const gate = await gateAppCustomer(context, QUOTE_BUDGETS)
  if (!gate.ok) return gate.response

  const parsed = appDeliveryQuoteRequestSchema.safeParse(await readAppJson(context.request))
  if (!parsed.success) return appFail('bad_request', BAD_ADDRESS)

  const outcome = await quoteAppDelivery(context.app.tenantId, parsed.data, liveDeps())
  if (!outcome.ok) return appFail(outcome.code, outcome.message, { retryAfterSec: outcome.retryAfterSec })
  return appOk(outcome.quote, { headers: NO_STORE })
}
