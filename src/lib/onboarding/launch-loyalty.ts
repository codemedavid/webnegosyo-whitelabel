/**
 * Put the starter stamp card live on a brand-new store.
 *
 * Runs under the service-role client from the onboarding pipeline, with no
 * merchant session. The program goes through the same `manage_loyalty_program`
 * RPC the merchant's own screen uses, which authorizes its `p_actor` against
 * `app_users` (an owner, a `loyalty_manage` admin of this store, or a
 * superadmin) — a null actor is refused as Forbidden. The store OWNER is the
 * actor: the card is created on their behalf, and they are the one account
 * every onboarded store is guaranteed to have.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { parseLoyaltyProgramInput } from '@/lib/loyalty/manage'
import { resolveProgramCatalog } from '@/lib/loyalty/program-catalog'
import { createLoyaltyProgram, writeLoyaltyProgramStatus } from '@/lib/loyalty/repository'
import { buildStarterLoyaltyProgram, STARTER_STAMP_THRESHOLD, type StarterLoyaltyItem } from '@/lib/loyalty/starter-program'
import { switchLoyaltyLive } from '@/lib/loyalty/go-live-write'

export type LaunchLoyaltyResult =
  | { status: 'created'; programId: string; rewardLabel: string; threshold: number }
  | { status: 'skipped'; reason: string }

export interface LaunchLoyaltyOptions {
  storeName: string
  bestSellerIds: readonly string[]
  /** Who the program is created as; defaults to the store's owner account. */
  actorUserId?: string
}

/** A starter card is ~1 reward over the whole menu; the API cap is plenty. */
const MAX_MENU_ROWS = 1000

/** A store has a handful of programs at most; this bounds the read. */
const MAX_PROGRAM_ROWS = 50

interface ExistingPrograms {
  /** Active, paused or ended: the store's loyalty is already decided. */
  hasSettledProgram: boolean
  /** A draft — on a fresh store, one an earlier attempt created but never activated. */
  draftId: string | null
}

async function readExistingPrograms(admin: SupabaseClient, tenantId: string): Promise<ExistingPrograms> {
  const { data, error } = await admin.from('loyalty_programs').select('id, status').eq('tenant_id', tenantId).limit(MAX_PROGRAM_ROWS)
  if (error) throw new Error(`Loyalty programs could not be read: ${error.message}`)
  const rows = (data ?? []) as Array<{ id: string; status: string | null }>
  return {
    hasSettledProgram: rows.some((row) => row.status !== 'draft'),
    draftId: rows.find((row) => row.status === 'draft')?.id ?? null,
  }
}

async function readOwnerUserId(admin: SupabaseClient, tenantId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('app_users')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .eq('role', 'admin')
    .eq('is_owner', true)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`The store owner could not be read: ${error.message}`)
  return (data as { user_id: string } | null)?.user_id ?? null
}

async function readRewardableItems(admin: SupabaseClient, tenantId: string): Promise<StarterLoyaltyItem[]> {
  const { data, error } = await admin
    .from('menu_items')
    .select('id, name, price, is_available, presell_enabled')
    .eq('tenant_id', tenantId)
    .order('order', { ascending: true })
    .limit(MAX_MENU_ROWS)
  if (error) throw new Error(`Menu items could not be read: ${error.message}`)
  const rows = (data ?? []) as Array<{ id: string; name: string; price: number | string | null; is_available: boolean | null; presell_enabled: boolean | null }>
  // Pre-sell items cannot be a free-item reward (`resolveProgramCatalog` refuses them).
  return rows
    .filter((row) => !row.presell_enabled)
    .map((row) => ({ id: row.id, name: row.name, price: Number(row.price ?? 0), isAvailable: row.is_available !== false }))
}

export async function launchStarterLoyalty(
  admin: SupabaseClient,
  tenantId: string,
  opts: LaunchLoyaltyOptions,
): Promise<LaunchLoyaltyResult> {
  const existing = await readExistingPrograms(admin, tenantId)
  if (existing.hasSettledProgram) return { status: 'skipped', reason: 'The store already has a loyalty program.' }

  const actor = opts.actorUserId ?? (await readOwnerUserId(admin, tenantId))
  if (!actor) return { status: 'skipped', reason: 'The store has no owner account yet.' }

  const starter = buildStarterLoyaltyProgram({
    storeName: opts.storeName,
    items: await readRewardableItems(admin, tenantId),
    bestSellerIds: opts.bestSellerIds,
  })
  if (!starter) return { status: 'skipped', reason: 'No available menu item can be the free reward.' }

  const parsed = parseLoyaltyProgramInput(starter.program)
  if (!parsed.ok) return { status: 'skipped', reason: parsed.error }

  const catalog = await resolveProgramCatalog(admin, tenantId, parsed.value.rules)
  if ('error' in catalog) return { status: 'skipped', reason: catalog.error }

  // A retry after the activation threw finishes that draft instead of making a second card.
  const programId = existing.draftId
    ?? (await createLoyaltyProgram(admin, tenantId, { ...parsed.value, rules: catalog.rules }, actor)).programId
  await writeLoyaltyProgramStatus(admin, tenantId, programId, { status: 'active' }, actor, 'draft')
  await switchLoyaltyLive(admin, tenantId)

  return { status: 'created', programId, rewardLabel: starter.rewardLabel, threshold: STARTER_STAMP_THRESHOLD }
}
