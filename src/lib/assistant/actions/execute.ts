/**
 * Run a confirmed proposal. No model is involved here: the stored payload goes
 * through the store's ordinary cookie-session writers, which re-check this
 * person's permission and the store's subscription themselves.
 */

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { applyBoostIdea } from '@/lib/boost/ai/apply'
import { getBoostMenu, type BoostTenantFields } from '@/lib/boost/workspace'
import { setBoostEnabled } from '@/lib/boost/writes'
import { refreshOfferCaches } from '@/lib/boost/refresh-offer-caches'
import { invalidateTenantCache } from '@/lib/cache'
import { createMenuItemAction } from '@/app/actions/menu-items'
import { recordStockMovement } from '@/lib/inventory/stock-service'
import { saveVoucherAction } from '@/app/actions/voucher-admin'
import { createSmsCampaign } from '@/lib/sms-campaigns-service'
import type { VoucherDraft } from '@/lib/vouchers/admin-validation'
import type { SmsCampaignDraft } from '@/lib/sms-campaign-draft'
import type { StoredAction } from '@/lib/assistant/actions/store'
import type {
  CampaignStatusPayload,
  ExecuteOutcome,
  LastCallPayload,
  LoyaltyProgramPayload,
  LoyaltyStatusPayload,
  MenuItemChangePayload,
  MenuImportPayload,
  MenuItemPayload,
  OfferChangePayload,
  OfferPayload,
  StockPayload,
  VoucherStatusPayload,
} from '@/lib/assistant/actions/kinds'
import {
  executeCampaignStatus,
  executeLastCall,
  executeLoyaltyProgram,
  executeLoyaltyStatus,
  executeMenuItemChange,
  executeOfferChange,
  executeVoucherStatus,
  type StoreRef,
} from '@/lib/assistant/actions/execute-manage'
import { executeMenuImport } from '@/lib/assistant/actions/execute-menu-import'

const BOOST_TENANT_SELECT =
  'id, order_backend, convex_deployment_url, menu_engineering_enabled, checkout_upsell_enabled, checkout_upsell_title, checkout_upsell_subtitle, checkout_upsell_max_items'

async function executeOffer(store: StoreRef, payload: OfferPayload): Promise<ExecuteOutcome> {
  const { data, error } = await createAdminClient().from('tenants').select(BOOST_TENANT_SELECT).eq('id', store.id).single()
  if (error || !data) return { ok: false, error: 'Store settings could not be read.' }
  const tenant = data as unknown as BoostTenantFields
  const switchOn = payload.enableBoost && tenant.menu_engineering_enabled !== true

  const result = await applyBoostIdea(store.id, payload.idea, await getBoostMenu(tenant))
  if (result.status === 'needs-edit') {
    return { ok: false, error: 'This offer no longer fits your menu (a dish changed or sold out). Open Boost Sales to adjust it.' }
  }
  if (switchOn) await setBoostEnabled(store.id, true)
  if (switchOn || payload.idea.kind === 'last_call') await invalidateTenantCache(store.slug, store.id)
  await refreshOfferCaches(store.id, store.slug)
  return {
    ok: true,
    message: `${payload.idea.title} is live${switchOn ? ' — Boost Sales is now on' : ''}.`,
    resultRef: result.ref,
    link: { label: 'See it in Boost Sales', path: '/boost-sales' },
  }
}

async function executeMenuItem(store: StoreRef, payload: MenuItemPayload): Promise<ExecuteOutcome> {
  const result = await createMenuItemAction(store.id, store.slug, payload.input)
  if (!result.success) return { ok: false, error: 'The dish could not be added. Open the menu editor to add it.' }
  const id = (result.data as { id?: string } | undefined)?.id ?? null
  return {
    ok: true,
    message: `${payload.input.name} was added to your menu.`,
    resultRef: id,
    link: id ? { label: 'Add a photo', path: `/menu/${id}` } : { label: 'Open menu', path: '/menu' },
  }
}

async function executeStock(store: StoreRef, payload: StockPayload): Promise<ExecuteOutcome> {
  const result = await recordStockMovement(store.id, payload.input)
  return {
    ok: true,
    message: `${payload.ingredientName} updated — now ${result.item.current_qty} on hand.`,
    resultRef: result.movement.id,
    link: { label: 'Open Inventory', path: '/inventory' },
  }
}

async function executeSms(store: StoreRef, payload: { draft: SmsCampaignDraft }): Promise<ExecuteOutcome> {
  // The confirm route has verified the caller (session, permission, subscription);
  // the service writes with the service role, and the draft status is forced again.
  const row = await createSmsCampaign(store.id, { ...payload.draft, status: 'draft' }, { client: createAdminClient() })
  return {
    ok: true,
    message: `"${payload.draft.name}" is saved as a draft. Activate it in the merchant app to send.`,
    resultRef: typeof row.id === 'string' ? row.id : null,
  }
}

async function executeVoucher(store: StoreRef, payload: { draft: VoucherDraft }): Promise<ExecuteOutcome> {
  const result = await saveVoucherAction(store.id, payload.draft)
  if (!result.success) return { ok: false, error: result.error ?? 'The voucher could not be saved.' }
  return {
    ok: true,
    message: `Voucher ${payload.draft.code} is ready.`,
    resultRef: result.voucherId ?? null,
    link: { label: 'Open Vouchers', path: '/vouchers' },
  }
}

function friendly(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (message.startsWith('Unauthorized')) return 'You no longer have permission to do this.'
  if (message.includes('subscription')) return 'Your subscription is paused, so changes are on hold.'
  return 'That change could not be made. Nothing was changed.'
}

export async function executeAction(action: StoredAction, store: StoreRef): Promise<ExecuteOutcome> {
  try {
    switch (action.kind) {
      case 'bundle':
      case 'upsell':
        return await executeOffer(store, action.payload as OfferPayload)
      case 'menu_item':
        return await executeMenuItem(store, action.payload as MenuItemPayload)
      case 'stock_adjustment':
        return await executeStock(store, action.payload as StockPayload)
      case 'sms_campaign':
        return await executeSms(store, action.payload as { draft: SmsCampaignDraft })
      case 'voucher':
        return await executeVoucher(store, action.payload as { draft: VoucherDraft })
      case 'offer_change':
        return await executeOfferChange(store, action.payload as OfferChangePayload)
      case 'last_call':
        return await executeLastCall(store, action.payload as LastCallPayload)
      case 'loyalty_program':
        return await executeLoyaltyProgram(store, action.payload as LoyaltyProgramPayload, action.createdBy)
      case 'loyalty_status':
        return await executeLoyaltyStatus(store, action.payload as LoyaltyStatusPayload, action.createdBy)
      case 'campaign_status':
        return await executeCampaignStatus(store, action.payload as CampaignStatusPayload)
      case 'voucher_status':
        return await executeVoucherStatus(store, action.payload as VoucherStatusPayload)
      case 'menu_item_change':
        return await executeMenuItemChange(store, action.payload as MenuItemChangePayload)
      case 'menu_import':
        return await executeMenuImport(store, action.payload as MenuImportPayload)
      default:
        return { ok: false, error: 'This kind of change is not supported yet.' }
    }
  } catch (error) {
    console.error('[assistant] action failed', { actionId: action.id, kind: action.kind, message: error instanceof Error ? error.message : String(error) })
    return { ok: false, error: friendly(error) }
  }
}
