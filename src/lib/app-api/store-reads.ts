import 'server-only'

import type { Outlet } from '@/lib/app-api/store-types'
import { readOrderTypes, readPaymentMethods } from '@/lib/checkout/load-checkout-config'
import { OUTLET_SELECT } from '@/lib/outlets/outlet-repository'
import { createCachedRead, storefrontTenantIdTag } from '@/lib/storefront/cached-read'
import { appDb } from '@/lib/app-api/service-db'
import { createPublicClient } from '@/lib/supabase/public'
import type { CheckoutQuestionRow, ComplementaryPairRow } from './project-catalog'

/**
 * The few reads the customer-app routes need beyond the storefront's own
 * cached tenant + menu snapshot. Each throws `AppReadError` on failure, so a
 * route answers "unavailable" instead of a half-empty store.
 */

export class AppReadError extends Error {
  constructor(readonly source: string, detail: string) {
    super(`Customer app could not read ${source}: ${detail}`)
    this.name = 'AppReadError'
  }
}

const admin = () => appDb()

/**
 * Every phone launch reads these, on a database all stores share, so each is
 * cached for a minute per store (failures are never cached — they throw).
 * A minute of staleness is safe: the server reprices and re-checks every
 * order when it is placed, whatever the app was shown.
 */
const APP_READ_REVALIDATE_SECONDS = 60

function cachedPerStore<T>(name: string, load: (tenantId: string) => Promise<T>): (tenantId: string) => Promise<T> {
  return createCachedRead(['customer-app', name], load, {
    tags: (tenantId) => [storefrontTenantIdTag(tenantId)],
    revalidate: APP_READ_REVALIDATE_SECONDS,
  })
}

function rethrowAs(source: string) {
  return (caught: unknown): never => {
    throw caught instanceof AppReadError ? caught : new AppReadError(source, caught instanceof Error ? caught.message : String(caught))
  }
}

/** `tenant_app_configs.published`, or null before App Studio publishes. */
async function loadPublishedAppConfig(tenantId: string): Promise<{ published: unknown; version: number }> {
  const { data, error } = await admin()
    .from('tenant_app_configs')
    .select('published, published_version')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) throw new AppReadError('the app config', error.message)
  return { published: data?.published ?? null, version: Number(data?.published_version ?? 0) }
}

/** The loyalty switches are not in the storefront projection (they gate the ledger). */
async function loadLoyaltyFlags(tenantId: string): Promise<{ loyalty_enabled: boolean | null; loyalty_shadow: boolean | null }> {
  const { data, error } = await admin().from('tenants').select('loyalty_enabled, loyalty_shadow').eq('id', tenantId).maybeSingle()
  if (error) throw new AppReadError('loyalty settings', error.message)
  return { loyalty_enabled: data?.loyalty_enabled ?? null, loyalty_shadow: data?.loyalty_shadow ?? null }
}

/** Merchant-made "goes well with" pairs (public RLS: active pairs only; first 1000 by display order). */
async function loadComplementaryPairs(tenantId: string): Promise<ComplementaryPairRow[]> {
  const { data, error } = await createPublicClient()
    .from('upsell_pairs')
    .select('source_item_id, target_item_id, display_order')
    .eq('tenant_id', tenantId)
    .eq('pair_type', 'complementary')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .limit(1000)
  if (error) throw new AppReadError('pairings', error.message)
  return (data ?? []) as ComplementaryPairRow[]
}

/** Far above any real form (the biggest store asks about a dozen per order type); a bound, not a rule. */
export const CHECKOUT_QUESTIONS_READ_LIMIT = 500

/** The store's checkout questions for every order type, in form order (`customer_form_fields_tenant_idx`). */
async function loadCheckoutQuestions(tenantId: string): Promise<CheckoutQuestionRow[]> {
  const { data, error } = await admin()
    .from('customer_form_fields')
    .select('id, order_type_id, field_name, field_label, field_type, is_required, placeholder, options, order_index')
    .eq('tenant_id', tenantId)
    .order('order_index', { ascending: true })
    .limit(CHECKOUT_QUESTIONS_READ_LIMIT)
  if (error) throw new AppReadError('checkout questions', error.message)
  return (data ?? []) as CheckoutQuestionRow[]
}

async function loadActiveOutlets(tenantId: string): Promise<Outlet[]> {
  const { data, error } = await createPublicClient()
    .from('outlets')
    .select(OUTLET_SELECT)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  if (error) throw new AppReadError('branches', error.message)
  return (data ?? []) as unknown as Outlet[]
}

export const readPublishedAppConfig = cachedPerStore('published-config', loadPublishedAppConfig)
export const readLoyaltyFlags = cachedPerStore('loyalty-flags', loadLoyaltyFlags)
export const readComplementaryPairs = cachedPerStore('pairs', loadComplementaryPairs)
export const readActiveOutlets = cachedPerStore('outlets', loadActiveOutlets)
export const readCheckoutQuestions = cachedPerStore('checkout-questions', loadCheckoutQuestions)
/** Uncached, for placing an order (like the order path's other reads). */
export const readCheckoutQuestionsFresh = loadCheckoutQuestions
export const readAppOrderTypes = cachedPerStore('order-types', (tenantId) =>
  readOrderTypes(createPublicClient(), tenantId).catch(rethrowAs('order types')),
)
export const readAppPaymentMethods = cachedPerStore('payment-methods', (tenantId) =>
  readPaymentMethods(createPublicClient(), tenantId).catch(rethrowAs('payment methods')),
)
