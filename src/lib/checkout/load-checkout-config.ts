import 'server-only'

import type { CustomerFormField, OrderType, Outlet, Tenant } from '@/types/database'
import { createPublicClient } from '@/lib/supabase/public'
import { OUTLET_SELECT } from '@/lib/outlets/outlet-repository'
import { isMultiBranchEnabled } from '@/lib/outlets/selection-timing'
import {
  groupFormFieldsByOrderType,
  groupPaymentMethodsByOrderType,
  type CheckoutConfig,
  type PaymentMethodWithLinks,
} from '@/lib/checkout/checkout-config'

/**
 * Raised when a read checkout cannot run without has failed. The page lets it
 * reach the tenant error boundary, which offers a retry.
 *
 * Deliberately NOT degraded to an empty list: an empty payment-method list is
 * a legitimate configuration ("no payment step"), so a failed read disguised
 * as one let a database blip wave orders through without a payment method.
 */
export class CheckoutConfigLoadError extends Error {
  constructor(readonly source: string, detail: string) {
    super(`Checkout could not load ${source}: ${detail}`)
    this.name = 'CheckoutConfigLoadError'
  }
}

type Client = ReturnType<typeof createPublicClient>

async function readOrderTypes(client: Client, tenantId: string): Promise<OrderType[]> {
  const { data, error } = await client
    .from('order_types')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_enabled', true)
    .eq('available_on_web', true)
    .order('order_index', { ascending: true })
  if (error) throw new CheckoutConfigLoadError('order types', error.message)
  return (data ?? []) as unknown as OrderType[]
}

async function readFormFields(client: Client, tenantId: string): Promise<CustomerFormField[]> {
  const { data, error } = await client
    .from('customer_form_fields')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('order_index', { ascending: true })
  if (error) throw new CheckoutConfigLoadError('the customer form', error.message)
  return (data ?? []) as unknown as CustomerFormField[]
}

async function readPaymentMethods(client: Client, tenantId: string): Promise<PaymentMethodWithLinks[]> {
  const { data, error } = await client
    .from('payment_methods')
    .select('*, payment_method_order_types(order_type_id)')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('order_index', { ascending: true })
  if (error) throw new CheckoutConfigLoadError('payment methods', error.message)
  return (data ?? []) as unknown as PaymentMethodWithLinks[]
}

/** Optional: a failure returns null and the branch hook reads them in the browser. */
async function readOutlets(client: Client, tenant: Tenant): Promise<Outlet[] | null> {
  if (!isMultiBranchEnabled(tenant)) return null
  const { data, error } = await client
    .from('outlets')
    .select(OUTLET_SELECT)
    .eq('tenant_id', tenant.id)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  if (error) {
    console.warn('[checkout-config] Branch read failed; the browser will retry:', error.message)
    return null
  }
  return (data ?? []) as unknown as Outlet[]
}

/** Optional: a failure falls back to the tenant's Messenger username, as before. */
async function readFacebookPageId(client: Client, tenant: Tenant): Promise<string | null> {
  if (!tenant.facebook_page_id) return null
  const { data, error } = await client
    .from('facebook_pages')
    .select('page_id')
    .eq('id', tenant.facebook_page_id)
    .eq('is_active', true)
    .maybeSingle()
  if (error) {
    console.warn('[checkout-config] Facebook page read failed:', error.message)
    return null
  }
  const pageId = (data as { page_id?: string | null } | null)?.page_id
  return pageId && pageId.trim() !== '' ? pageId : null
}

/** A thrown optional read (a network abort, say) degrades like a failed one. */
async function optional<T>(label: string, read: Promise<T | null>): Promise<T | null> {
  try {
    return await read
  } catch (error) {
    console.warn(`[checkout-config] ${label} read threw:`, error instanceof Error ? error.message : error)
    return null
  }
}

/**
 * Loads every checkout input for one tenant in a single parallel batch.
 *
 * Uncached on purpose. Payment methods and order types are edited from the web
 * admin, the merchant app (straight to Supabase), MCP and the Loyverse sync —
 * no single write path could purge a cache entry, and a stale payment method
 * at checkout is worse than a few milliseconds. The tenant row, which IS
 * cached, comes from the caller.
 */
export async function loadCheckoutConfig(tenant: Tenant): Promise<CheckoutConfig> {
  const client = createPublicClient()
  const [orderTypes, formFields, paymentMethods, outlets, facebookPageId] = await Promise.all([
    readOrderTypes(client, tenant.id),
    readFormFields(client, tenant.id),
    readPaymentMethods(client, tenant.id),
    optional('branches', readOutlets(client, tenant)),
    optional('Facebook page', readFacebookPageId(client, tenant)),
  ])

  return {
    orderTypes,
    formFieldsByOrderType: groupFormFieldsByOrderType(formFields),
    paymentMethodsByOrderType: groupPaymentMethodsByOrderType(paymentMethods),
    outlets,
    facebookPageId,
  }
}
