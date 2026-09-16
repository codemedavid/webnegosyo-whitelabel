import 'server-only'
import { isDeepStrictEqual } from 'node:util'
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeModifierGroups } from '@/lib/modifier-groups'
import {
  priceLoyaltyCart,
  type LoyaltyPricingCatalogItem,
} from './quote-pricing'
import {
  buildOutletMenuIndex,
  resolveMenuForOutlet,
} from '@/lib/outlets/outlet-menu-overrides'
import { resolveOrderBackend } from '@/lib/order-backend'

export class LoyaltyQuoteError extends Error {}
export interface QuoteRequest {
  tenantId: string
  actor: string
  claimHash: string
  requestId: string
  outletId: string | null
  orderTypeId: string
  cart: {
    lines: {
      menuItemId: string
      quantity: number
      selectedOptionIds: string[]
    }[]
  }
}
/** Loads the platform catalog used by all three order backends. Never accepts
 * request prices, payment policies, customer identity or reward terms. */
export async function issueLoyaltyQuote(
  admin: SupabaseClient,
  input: QuoteRequest,
) {
  const { tenantId, actor, claimHash, outletId, cart } = input
  const existing = await admin
    .from('loyalty_pos_quotes')
    .select('order_snapshot,total_centavos,order_backend')
    .eq('tenant_id', tenantId)
    .eq('created_by', actor)
    .eq('id', input.requestId)
    .maybeSingle()
  if (existing.error) throw new Error('Quote recovery unavailable')
  if (existing.data) {
    const snapshot = existing.data.order_snapshot
    if (
      !isDeepStrictEqual(snapshot.cart, cart) ||
      snapshot.orderTypeId !== input.orderTypeId ||
      snapshot.outletId !== outletId
    )
      throw new LoyaltyQuoteError(
        'This request ID belongs to a different cart.',
      )
    const { data, error } = await admin.rpc('issue_loyalty_pos_quote', {
      p_tenant_id: tenantId,
      p_actor: actor,
      p_claim_hash: claimHash,
      p_outlet_id: outletId,
      p_quote_id: input.requestId,
      p_backend: existing.data.order_backend,
      p_total_centavos: existing.data.total_centavos,
      p_snapshot: snapshot,
    })
    if (error || !data)
      throw new LoyaltyQuoteError(
        'The original quote is expired or unavailable. Request a new claim QR.',
      )
    return {
      ...data,
      lines: snapshot.items,
      discount: snapshot.discount,
      totals: snapshot.totals,
      paymentMethods: snapshot.paymentMethods,
    }
  }
  const claimResult = await admin
    .from('loyalty_verified_claims')
    .select('entitlement_id')
    .eq('tenant_id', tenantId)
    .eq('token_hash', claimHash)
    .maybeSingle()
  if (claimResult.error) throw new Error('Claim read failed')
  if (!claimResult.data)
    throw new LoyaltyQuoteError('The claim is invalid or expired.')
  const [
    entitlement,
    tenant,
    items,
    overrides,
    orderType,
    itemPrices,
    methods,
    assignments,
  ] = await Promise.all([
    admin
      .from('loyalty_entitlements')
      .select('id, terms')
      .eq('tenant_id', tenantId)
      .eq('id', claimResult.data.entitlement_id)
      .maybeSingle(),
    admin
      .from('tenants')
      .select('order_backend, convex_deployment_url, inventory_enabled')
      .eq('id', tenantId)
      .maybeSingle(),
    admin
      .from('menu_items')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('id', [...new Set(cart.lines.map((line) => line.menuItemId))]),
    outletId
      ? admin
          .from('outlet_menu_items')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('outlet_id', outletId)
      : Promise.resolve({ data: [], error: null }),
    admin
      .from('order_types')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', input.orderTypeId)
      .maybeSingle(),
    admin
      .from('order_type_item_prices')
      .select('menu_item_id,price')
      .eq('tenant_id', tenantId)
      .eq('order_type_id', input.orderTypeId),
    admin
      .from('payment_methods')
      .select('id,name,is_active,require_payment_proof')
      .eq('tenant_id', tenantId)
      .eq('is_active', true),
    admin
      .from('payment_method_order_types')
      .select('payment_method_id')
      .eq('order_type_id', input.orderTypeId),
  ])
  if (
    [
      entitlement,
      tenant,
      items,
      overrides,
      orderType,
      itemPrices,
      methods,
      assignments,
    ].some((result) => result.error)
  )
    throw new Error('Quote data unavailable')
  if (!entitlement.data || !tenant.data || !orderType.data)
    throw new LoyaltyQuoteError('The reward or order type is unavailable.')
  const type = orderType.data
  if (!type.is_enabled || type.available_on_pos !== true)
    throw new LoyaltyQuoteError(
      'This order type is not available at the register.',
    )
  // These flows need their own authoritative fee/inventory adapters. Refuse
  // explicitly rather than bypassing existing pricing or stock enforcement.
  if (
    type.type === 'delivery' ||
    type.service_charge_enabled ||
    Number(type.pos_markup_percent ?? 0) !== 0 ||
    itemPrices.data?.length
  )
    throw new LoyaltyQuoteError(
      'Loyalty redemption is not supported for delivery, service charges, or order-type price overrides yet.',
    )
  if (tenant.data.inventory_enabled)
    throw new LoyaltyQuoteError(
      'Loyalty redemption for inventory-tracked sales is not available yet.',
    )
  const catalog = resolveMenuForOutlet(
    (items.data ?? []) as LoyaltyPricingCatalogItem[],
    buildOutletMenuIndex(overrides.data ?? []),
    outletId,
  )
  if (
    catalog.some((item) =>
      normalizeModifierGroups(item).some((group) =>
        group.options.some(
          (option) =>
            option.stock_mode === 'simple' || option.stock_mode === 'recipe',
        ),
      ),
    )
  )
    throw new LoyaltyQuoteError(
      'Loyalty redemption for stock-tracked options is not available yet.',
    )
  const priced = priceLoyaltyCart(cart, catalog, entitlement.data.terms)
  if (!priced.ok)
    throw new LoyaltyQuoteError(
      `This cart cannot use the reward (${priced.reason.replaceAll('_', ' ')}).`,
    )
  if (
    priced.totals.subtotalCentavos <
    Math.round(Number(type.minimum_order_amount ?? 0) * 100)
  )
    throw new LoyaltyQuoteError(
      'The cart does not meet the minimum order amount.',
    )
  const permitted = new Set(
    (assignments.data ?? []).map((row) => row.payment_method_id),
  )
  const paymentMethods = (methods.data ?? [])
    .filter(
      (method) =>
        permitted.has(method.id) && method.require_payment_proof === false,
    )
    .map((method) => ({
      id: method.id,
      name: method.name,
      kind: /^cash(?: on delivery)?$/i.test(method.name.trim())
        ? ('cash' as const)
        : ('manual' as const),
      requiresReference: !/^cash(?: on delivery)?$/i.test(method.name.trim()),
    }))
  if (!paymentMethods.length)
    throw new LoyaltyQuoteError(
      'No supported payment method is configured for this order type.',
    )
  const paymentPolicy = {
    totalCentavos: priced.totals.grandTotalCentavos,
    allowedMethods: paymentMethods.map(({ id, kind, requiresReference }) => ({
      id,
      kind,
      requiresReference,
    })),
  }
  const backend = resolveOrderBackend(tenant.data)
  const snapshot = {
    version: 1,
    entitlementId: entitlement.data.id,
    source: 'pos',
    outletId,
    orderTypeId: input.orderTypeId,
    orderTypeName: type.name,
    cart,
    items: priced.lines,
    discount: priced.discount,
    totals: priced.totals,
    paymentPolicy,
    paymentMethods,
  }
  const { data, error } = await admin.rpc('issue_loyalty_pos_quote', {
    p_tenant_id: tenantId,
    p_actor: actor,
    p_claim_hash: claimHash,
    p_outlet_id: outletId,
    p_quote_id: input.requestId,
    p_backend:
      backend === 'platform'
        ? 'platform_supabase'
        : backend === 'supabase'
          ? 'tenant_supabase'
          : 'convex',
    p_total_centavos: priced.totals.grandTotalCentavos,
    p_snapshot: snapshot,
  })
  if (error) {
    if (
      /Forbidden|Claim|claim|Reward is not valid|Reservation unavailable|Live loyalty/.test(
        error.message,
      )
    )
      throw new LoyaltyQuoteError(
        'This claim is expired, already used, or unavailable at this branch. Ask the customer for a new QR.',
      )
    throw new Error('Quote write failed')
  }
  if (!data) throw new Error('Quote write unconfirmed')
  return {
    ...data,
    lines: priced.lines,
    discount: priced.discount,
    totals: priced.totals,
    paymentMethods,
  }
}
