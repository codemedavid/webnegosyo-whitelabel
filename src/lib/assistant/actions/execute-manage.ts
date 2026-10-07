/**
 * Confirmed proposals that change something the store already has: an offer,
 * the cart's last call, a loyalty program, an SMS campaign, a voucher, a dish.
 *
 * Every write goes through the writer the admin screens use. Menu, Boost and
 * voucher writers re-check the caller's permission through the request's
 * session; the loyalty and campaign writes run under the service role exactly
 * like their web routes, behind the confirm route's permission check
 * (ACTION_PERMISSION) — the same boundary those routes rely on.
 */

import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { setBoostEnabled, setBoostPairingActive, saveBoostLastCall } from '@/lib/boost/writes'
import { toggleBundleActive, updateBundleFields } from '@/lib/bundles-service'
import { updateUpsellPair } from '@/lib/menu-engineering-service'
import { refreshOfferCaches } from '@/lib/boost/refresh-offer-caches'
import { invalidateTenantCache } from '@/lib/cache'
import { updateMenuItemFields } from '@/lib/admin-service'
import { revalidateStorefrontMenu } from '@/lib/storefront/revalidate'
import { toggleAvailabilityAction } from '@/app/actions/menu-items'
import { setVoucherActiveAction } from '@/app/actions/voucher-admin'
import { resolveProgramCatalog } from '@/lib/loyalty/program-catalog'
import { createLoyaltyProgram, readLoyaltyProgramStatus, reviseLoyaltyProgram, writeLoyaltyProgramStatus } from '@/lib/loyalty/repository'
import { programStatusPatch } from '@/lib/loyalty/manage'
import { switchLoyaltyLive } from '@/lib/loyalty/go-live-write'
import { formatPeso } from '@/components/admin/dashboard/dashboard-format'
import type {
  CampaignStatusPayload,
  ExecuteOutcome,
  LastCallPayload,
  LoyaltyProgramPayload,
  LoyaltyStatusPayload,
  MenuItemChangePayload,
  OfferChangePayload,
  OfferSnapshot,
  OfferTarget,
  VoucherStatusPayload,
} from '@/lib/assistant/actions/kinds'

export interface StoreRef {
  id: string
  slug: string
}

const BOOST_LINK = { label: 'See it in Boost Sales', path: '/boost-sales' }
const LOYALTY_LINK = { label: 'Open Loyalty', path: '/loyalty' }

function serviceClient(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

const STALE = 'This changed since it was proposed, so nothing was changed. Ask again for a fresh proposal.'

function numberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value)
}

/** The offer as stored right now, in the shape the proposal recorded. Null = gone. */
async function readOfferState(storeId: string, target: OfferTarget): Promise<OfferSnapshot | null> {
  const client = serviceClient()
  if (target.kind === 'combo') {
    const { data } = await client.from('bundles').select('is_active, fixed_price, discount_percent').eq('id', target.id).eq('tenant_id', storeId).maybeSingle()
    const row = data as { is_active: boolean; fixed_price: unknown; discount_percent: unknown } | null
    return row ? { isActive: row.is_active, fixedPrice: numberOrNull(row.fixed_price), discountPercent: numberOrNull(row.discount_percent) } : null
  }
  const query = client.from('upsell_pairs').select('is_active').eq('tenant_id', storeId)
  const { data } = target.kind === 'upgrade'
    ? await query.eq('id', target.id)
    : await query.eq('pair_type', 'complementary').in('source_item_id', target.sourceIds)
  const rows = (data ?? []) as Array<{ is_active: boolean }>
  return rows.length > 0 ? { isActive: rows.every((row) => row.is_active) } : null
}

function isSameOffer(now: OfferSnapshot, expected: OfferSnapshot): boolean {
  return now.isActive === expected.isActive
    && (now.fixedPrice ?? null) === (expected.fixedPrice ?? null)
    && (now.discountPercent ?? null) === (expected.discountPercent ?? null)
}

export async function executeOfferChange(store: StoreRef, payload: OfferChangePayload): Promise<ExecuteOutcome> {
  const { target, change } = payload
  const current = await readOfferState(store.id, target)
  if (!current) return { ok: false, error: 'That offer no longer exists, so nothing was changed.' }
  if (!isSameOffer(current, payload.expected)) return { ok: false, error: STALE }
  const isActive = change === 'resume'
  if (change === 'price') {
    if (target.kind !== 'combo' || payload.price === null) return { ok: false, error: 'Only a combo can be re-priced.' }
    await updateBundleFields(target.id, store.id, { pricing_type: 'fixed', fixed_price: payload.price })
  } else if (target.kind === 'combo') {
    await toggleBundleActive(target.id, store.id, isActive)
  } else if (target.kind === 'upgrade') {
    await updateUpsellPair(target.id, store.id, { is_active: isActive })
  } else {
    await setBoostPairingActive(store.id, target.sourceIds, isActive)
  }
  await refreshOfferCaches(store.id, store.slug)
  const done = change === 'price' ? `now ${formatPeso(payload.price ?? 0)}` : isActive ? 'showing again' : 'paused'
  return { ok: true, message: `${payload.name} is ${done}.`, resultRef: target.kind === 'pairing' ? null : target.id, link: BOOST_LINK }
}

export async function executeLastCall(store: StoreRef, payload: LastCallPayload): Promise<ExecuteOutcome> {
  if (payload.enableBoost) await setBoostEnabled(store.id, true)
  await saveBoostLastCall(store.id, payload.input)
  await invalidateTenantCache(store.slug, store.id)
  await refreshOfferCaches(store.id, store.slug)
  return {
    ok: true,
    message: payload.input.enabled ? `Your cart's last call is on${payload.enableBoost ? ' — Boost Sales is now on' : ''}.` : "Your cart's last call is off.",
    resultRef: null,
    link: BOOST_LINK,
  }
}

function loyaltyError(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (/changed/i.test(message)) return 'The program changed since this was proposed. Ask again for a fresh proposal.'
  if (/ended/i.test(message)) return 'That program has ended and cannot be changed.'
  return 'The loyalty program could not be saved. Nothing was changed.'
}

export async function executeLoyaltyProgram(store: StoreRef, payload: LoyaltyProgramPayload, actor: string): Promise<ExecuteOutcome> {
  const client = serviceClient()
  const rules = payload.mode === 'create' ? payload.input.rules : payload.rules
  // The free-item dish may have changed or sold out since the proposal.
  const catalog = await resolveProgramCatalog(client, store.id, rules)
  if ('error' in catalog) return { ok: false, error: catalog.error }
  try {
    if (payload.mode === 'create') {
      const created = await createLoyaltyProgram(client, store.id, { ...payload.input, rules: catalog.rules }, actor)
      return { ok: true, message: `${payload.input.name} is saved as a draft. Make it live when you are ready.`, resultRef: created.programId, link: LOYALTY_LINK }
    }
    const revised = await reviseLoyaltyProgram(client, store.id, payload.programId, catalog.rules, actor, payload.expectedVersion)
    return { ok: true, message: `${payload.name} has new rules (version ${revised.version}).`, resultRef: payload.programId, link: LOYALTY_LINK }
  } catch (error) {
    console.error('[assistant] loyalty program write failed', { tenantId: store.id, message: error instanceof Error ? error.message : String(error) })
    return { ok: false, error: loyaltyError(error) }
  }
}

export async function executeLoyaltyStatus(store: StoreRef, payload: LoyaltyStatusPayload, actor: string): Promise<ExecuteOutcome> {
  const client = serviceClient()
  const current = await readLoyaltyProgramStatus(client, store.id, payload.programId)
  if (!current) return { ok: false, error: 'That loyalty program no longer exists.' }
  if (current.status !== payload.expectedStatus) return { ok: false, error: 'The program changed since this was proposed. Ask again for a fresh proposal.' }
  const patch = programStatusPatch(current, payload.to, new Date())
  if (!patch) return { ok: false, error: `A ${current.status} program cannot become ${payload.to}.` }
  try {
    await writeLoyaltyProgramStatus(client, store.id, payload.programId, patch, actor, current.status)
  } catch (error) {
    console.error('[assistant] loyalty status write failed', { tenantId: store.id, message: error instanceof Error ? error.message : String(error) })
    return { ok: false, error: loyaltyError(error) }
  }
  // Activating is the owner saying "go": the store stops being in shadow.
  if (patch.status === 'active') await switchLoyaltyLive(client, store.id)
  return {
    ok: true,
    message: patch.status === 'active' ? `${payload.name} is live — customers earn on completed orders.` : `${payload.name} is paused.`,
    resultRef: payload.programId,
    link: LOYALTY_LINK,
  }
}

export async function executeCampaignStatus(store: StoreRef, payload: CampaignStatusPayload): Promise<ExecuteOutcome> {
  const { data, error } = await serviceClient()
    .from('sms_campaigns')
    .update({ status: 'paused' })
    .eq('id', payload.campaignId)
    .eq('tenant_id', store.id)
    .eq('status', 'active')
    .select('id')
  if (error) throw new Error(`campaign pause failed: ${error.message}`)
  // Zero rows: it was paused, archived or removed in the meantime.
  if ((data ?? []).length !== 1) return { ok: false, error: 'That campaign is no longer active, so nothing was changed.' }
  return { ok: true, message: `"${payload.name}" is paused. Resume it from the merchant app when you are ready.`, resultRef: payload.campaignId, link: { label: 'Open Customers', path: '/customers' } }
}

export async function executeVoucherStatus(store: StoreRef, payload: VoucherStatusPayload): Promise<ExecuteOutcome> {
  const result = await setVoucherActiveAction(store.id, payload.voucherId, payload.isActive)
  if (!result.success) return { ok: false, error: result.error ?? 'The voucher could not be changed.' }
  return {
    ok: true,
    message: `Voucher ${payload.code} is ${payload.isActive ? 'on' : 'off'}.`,
    resultRef: payload.voucherId,
    link: { label: 'Open Vouchers', path: '/vouchers' },
  }
}

export async function executeMenuItemChange(store: StoreRef, payload: MenuItemChangePayload): Promise<ExecuteOutcome> {
  if (payload.price !== null) {
    const { data } = await serviceClient().from('menu_items').select('price').eq('id', payload.itemId).eq('tenant_id', store.id).maybeSingle()
    const row = data as { price: unknown } | null
    if (!row) return { ok: false, error: 'That dish is no longer on the menu.' }
    if (Number(row.price) !== payload.expectedPrice) return { ok: false, error: STALE }
    await updateMenuItemFields(payload.itemId, store.id, { price: payload.price })
    revalidateStorefrontMenu(store.slug)
  }
  if (payload.isAvailable !== null) {
    const result = await toggleAvailabilityAction(payload.itemId, store.id, store.slug, payload.isAvailable)
    if (!result.success) {
      return { ok: false, error: payload.price !== null ? 'The price changed, but availability could not be updated.' : 'Availability could not be updated.' }
    }
  }
  const parts = [
    payload.price !== null ? `now ${formatPeso(payload.price)}` : null,
    payload.isAvailable === null ? null : payload.isAvailable ? 'back in stock' : 'marked sold out',
  ].filter(Boolean)
  return { ok: true, message: `${payload.name} is ${parts.join(' and ')}.`, resultRef: payload.itemId, link: { label: 'Open dish', path: `/menu/${payload.itemId}` } }
}
