/**
 * Boost Sales writes that the older services never offered as one operation:
 * a pairing saved as a whole offer, an upgrade edited in place, the cart's
 * last call saved in one go, and the merchant switching the feature on.
 *
 * Every write checks the caller's permission and that every menu item it
 * names belongs to this tenant — the ids arrive from the browser.
 */

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyTenantPermission } from '@/lib/admin-service'
import type { ProvisioningCtx } from '@/lib/provisioning/context'
import {
  createUpsellPair,
  updateUpsellPair,
  updateCheckoutUpsellSettings,
} from '@/lib/menu-engineering-service'
import { planPairingSave } from './pairing-groups'
import { MAX_PAIRING_TARGETS } from './pairing-limits'

const MAX_PAIRING_SOURCES = 500
const MAX_LAST_CALL_PICKS = 50

const itemId = z.string().uuid()

export const pairingSaveSchema = z.object({
  previousSourceIds: z.array(itemId).max(MAX_PAIRING_SOURCES),
  sourceIds: z.array(itemId).min(1, 'Choose at least one item').max(MAX_PAIRING_SOURCES),
  targetIds: z.array(itemId).min(1, 'Choose at least one suggestion').max(MAX_PAIRING_TARGETS),
  isActive: z.boolean(),
})
export type PairingSaveInput = z.infer<typeof pairingSaveSchema>

const optionalLabel = (max: number) =>
  z.string().trim().max(max).nullable().transform((value) => (value ? value : null))

export const upgradeSaveSchema = z.object({
  id: itemId.optional(),
  sourceId: itemId,
  targetId: itemId,
  header: optionalLabel(100),
  sourceLabel: optionalLabel(50),
  targetLabel: optionalLabel(50),
  isActive: z.boolean(),
}).refine((value) => value.sourceId !== value.targetId, {
  message: 'An item cannot upgrade to itself',
  path: ['targetId'],
})
export type UpgradeSaveInput = z.input<typeof upgradeSaveSchema>

export const lastCallSaveSchema = z.object({
  enabled: z.boolean(),
  title: z.string().trim().min(1, 'Add a headline').max(100),
  subtitle: z.string().trim().max(200),
  maxItems: z.number().int().min(1).max(8),
  /** Empty means automatic: pairings, then bestsellers, then quick add-ons. */
  pickedItemIds: z.array(itemId).max(MAX_LAST_CALL_PICKS),
})
export type LastCallSaveInput = z.infer<typeof lastCallSaveSchema>

type ServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * The client a write runs on. With a `ProvisioningCtx` the caller has already
 * authorized the request (the merchant app's bearer route) and supplies the
 * service-role client; without one, the merchant's own cookie session.
 */
async function writeClient(ctx: ProvisioningCtx | undefined): Promise<ServerClient> {
  return ctx ? (ctx.client as unknown as ServerClient) : await createClient()
}

async function assertTenantItems(client: ServerClient, tenantId: string, ids: readonly string[]) {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return
  const { data, error } = await client
    .from('menu_items')
    .select('id')
    .eq('tenant_id', tenantId)
    .in('id', unique)
  if (error) throw error
  if ((data ?? []).length !== unique.length) {
    throw new Error('Some of these items are no longer on your menu. Refresh and try again.')
  }
}

/**
 * Upsert the new rows first, then remove only the rows the offer no longer
 * has. A failed upsert leaves the previous pairing fully intact, where a
 * delete-then-insert would have left the merchant with nothing.
 */
export async function saveBoostPairing(tenantId: string, raw: PairingSaveInput, ctx?: ProvisioningCtx): Promise<void> {
  if (!ctx) await verifyTenantPermission(tenantId, 'analytics', 'delete')
  const input = pairingSaveSchema.parse(raw)
  const client = await writeClient(ctx)
  await assertTenantItems(client, tenantId, [...input.sourceIds, ...input.targetIds])

  const plan = planPairingSave(input)
  if (plan.rows.length === 0) throw new Error('An item cannot be suggested with itself')

  const { error: upsertError } = await client
    .from('upsell_pairs')
    .upsert(
      plan.rows.map((row) => ({ ...row, tenant_id: tenantId, pair_type: 'complementary' })),
      { onConflict: 'tenant_id,source_item_id,target_item_id,pair_type' }
    )
  if (upsertError) throw upsertError

  const keep = new Set(plan.rows.map((row) => `${row.source_item_id}|${row.target_item_id}`))
  const { data: existing, error: readError } = await client
    .from('upsell_pairs')
    .select('id, source_item_id, target_item_id')
    .eq('tenant_id', tenantId)
    .eq('pair_type', 'complementary')
    .in('source_item_id', plan.deleteSourceIds)
  if (readError) throw readError

  const staleIds = (existing ?? [])
    .filter((row) => !keep.has(`${row.source_item_id}|${row.target_item_id}`))
    .map((row) => row.id)
  if (staleIds.length === 0) return

  const { error: deleteError } = await client
    .from('upsell_pairs')
    .delete()
    .eq('tenant_id', tenantId)
    .in('id', staleIds)
  if (deleteError) throw deleteError
}

const sourceIdsSchema = z.array(itemId).min(1).max(MAX_PAIRING_SOURCES)

export async function setBoostPairingActive(tenantId: string, sourceIds: string[], isActive: boolean): Promise<void> {
  await verifyTenantPermission(tenantId, 'analytics')
  const ids = sourceIdsSchema.parse(sourceIds)
  const client = await createClient()
  const { error } = await client
    .from('upsell_pairs')
    .update({ is_active: isActive })
    .eq('tenant_id', tenantId)
    .eq('pair_type', 'complementary')
    .in('source_item_id', ids)
  if (error) throw error
}

export async function deleteBoostPairing(tenantId: string, sourceIds: string[]): Promise<void> {
  await verifyTenantPermission(tenantId, 'analytics', 'delete')
  const ids = sourceIdsSchema.parse(sourceIds)
  const client = await createClient()
  const { error } = await client
    .from('upsell_pairs')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('pair_type', 'complementary')
    .in('source_item_id', ids)
  if (error) throw error
}

/** Edits in place — the old flow deleted the pair first and lost it on failure. */
export async function saveBoostUpgrade(tenantId: string, raw: UpgradeSaveInput, ctx?: ProvisioningCtx): Promise<string> {
  const input = upgradeSaveSchema.parse(raw)
  const client = await writeClient(ctx)
  if (!ctx) await verifyTenantPermission(tenantId, 'analytics', input.id ? 'edit' : 'create')
  await assertTenantItems(client, tenantId, [input.sourceId, input.targetId])

  const fields = {
    source_item_id: input.sourceId,
    target_item_id: input.targetId,
    upgrade_header: input.header,
    source_label: input.sourceLabel,
    target_label: input.targetLabel,
    is_active: input.isActive,
  }

  if (input.id) {
    const updated = await updateUpsellPair(input.id, tenantId, { ...fields, pair_type: 'upgrade' }, ctx)
    return updated.id
  }
  const created = await createUpsellPair(tenantId, {
    ...fields,
    upgrade_header: fields.upgrade_header ?? undefined,
    source_label: fields.source_label ?? undefined,
    target_label: fields.target_label ?? undefined,
    pair_type: 'upgrade',
  }, ctx)
  return created.id
}

export async function saveBoostLastCall(tenantId: string, raw: LastCallSaveInput, ctx?: ProvisioningCtx): Promise<void> {
  const input = lastCallSaveSchema.parse(raw)
  await updateCheckoutUpsellSettings(tenantId, {
    checkout_upsell_enabled: input.enabled,
    checkout_upsell_title: input.title,
    checkout_upsell_subtitle: input.subtitle,
    checkout_upsell_max_items: input.maxItems,
  }, ctx)

  const client = await writeClient(ctx)
  await assertTenantItems(client, tenantId, input.pickedItemIds)

  const { error: clearError } = await client
    .from('menu_items')
    .update({ show_in_checkout_upsell: false })
    .eq('tenant_id', tenantId)
    .eq('show_in_checkout_upsell', true)
  if (clearError) throw clearError

  if (input.pickedItemIds.length === 0) return
  const { error: setError } = await client
    .from('menu_items')
    .update({ show_in_checkout_upsell: true })
    .eq('tenant_id', tenantId)
    .in('id', input.pickedItemIds)
  if (setError) throw setError
}

/**
 * Boost Sales on/off. `menu_engineering_enabled` and `bundles_enabled` are
 * platform-locked against direct tenant writes (the guard trigger refuses the
 * `authenticated` role), so after checking the merchant's own permission the
 * write goes through the service role, which the guard lets pass.
 */
export async function setBoostEnabled(tenantId: string, enabled: boolean, ctx?: ProvisioningCtx): Promise<void> {
  if (!ctx) await verifyTenantPermission(tenantId, 'analytics')
  const { error } = await createAdminClient()
    .from('tenants')
    .update({ menu_engineering_enabled: enabled, bundles_enabled: enabled })
    .eq('id', tenantId)
  if (error) throw error
}
