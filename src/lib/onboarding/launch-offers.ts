/**
 * The owner's first decision on the reveal: keep or skip each combo the build
 * drafted. Combos wait in the store's LAUNCH suggestions (never live until
 * kept); keeping one is the same approve → apply path as any Boost AI
 * suggestion, so it goes live exactly like a one-tap idea in Boost Sales.
 *
 * Called with the set-up token (the owner's credential) and the service-role
 * client, so the owner is the actor on record. Only the store's own launch
 * combos can be decided here.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ComboIdea } from '@/lib/boost/ideas'
import { getBoostAiProposal, type BoostAiProposal } from '@/lib/boost/ai/store'
import { createBoostAiProposalNow, decideBoostAiProposal } from '@/lib/boost/ai/service'
import { loadLaunchMenu } from './boost-autopilot'
import { readOwnerUserId } from './launch-loyalty'

export type LaunchComboStatus = 'waiting' | 'kept' | 'skipped'

export interface LaunchComboView {
  id: string
  title: string
  reason: string
  items: Array<{ name: string; price: number }>
  price: number
  regularPrice: number
  saves: number | null
  status: LaunchComboStatus
}

export type LaunchComboDecision = 'keep' | 'skip'
export type LaunchComboOutcome = 'kept' | 'skipped' | 'needs-edit'

export class LaunchOfferError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

const MAX_LAUNCH_PROPOSALS = 20

function statusOf(proposal: Pick<BoostAiProposal, 'status'>): LaunchComboStatus {
  if (proposal.status === 'applied') return 'kept'
  if (proposal.status === 'rejected') return 'skipped'
  return 'waiting'
}

async function readLaunchGenerationId(admin: SupabaseClient, tenantId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('boost_ai_generations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('source', 'launch')
    .maybeSingle()
  if (error) throw new Error(`Launch combos could not be read: ${error.message}`)
  return (data as { id: string } | null)?.id ?? null
}

/** The combo, priced from the menu as it is now (names may have been fixed since). */
export function toLaunchComboView(
  proposal: Pick<BoostAiProposal, 'id' | 'status'> & { idea: ComboIdea },
  names: ReadonlyMap<string, { name: string; price: number }>,
): LaunchComboView {
  const idea = proposal.idea
  const items = idea.picks.flatMap((pick) => {
    const item = names.get(pick.itemIds[0] ?? '')
    return item ? [item] : []
  })
  return {
    id: proposal.id,
    title: idea.title,
    reason: idea.reason,
    items,
    price: idea.price,
    regularPrice: idea.regularPrice,
    saves: idea.savings?.amount ?? null,
    status: statusOf(proposal),
  }
}

export async function readLaunchCombos(admin: SupabaseClient, tenantId: string): Promise<LaunchComboView[]> {
  const generationId = await readLaunchGenerationId(admin, tenantId)
  if (!generationId) return []
  const [proposals, menu] = await Promise.all([
    admin
      .from('boost_ai_proposals')
      .select('id, status, payload, position')
      .eq('tenant_id', tenantId)
      .eq('generation_id', generationId)
      .eq('kind', 'combo')
      .order('position', { ascending: true })
      .limit(MAX_LAUNCH_PROPOSALS),
    loadLaunchMenu({ client: admin as never }, tenantId),
  ])
  if (proposals.error) throw new Error(`Launch combos could not be read: ${proposals.error.message}`)
  const names = new Map(menu.items.map((item) => [item.id, { name: item.name, price: item.price }]))
  const rows = (proposals.data ?? []) as Array<{ id: string; status: BoostAiProposal['status']; payload: ComboIdea }>
  return rows.map((row) => toLaunchComboView({ id: row.id, status: row.status, idea: row.payload }, names))
}

export async function decideLaunchCombo(
  admin: SupabaseClient,
  tenant: { id: string; slug: string },
  proposalId: string,
  decision: LaunchComboDecision,
): Promise<LaunchComboOutcome> {
  const [generationId, proposal] = await Promise.all([
    readLaunchGenerationId(admin, tenant.id),
    getBoostAiProposal(tenant.id, proposalId),
  ])
  if (!proposal || !generationId || proposal.generationId !== generationId || proposal.kind !== 'combo') {
    throw new LaunchOfferError('This combo is not part of your launch.', 404)
  }
  const ownerId = await readOwnerUserId(admin, tenant.id)
  if (!ownerId) throw new LaunchOfferError('Your store has no owner account yet.', 409)

  if (decision === 'skip') {
    if (proposal.status === 'rejected') return 'skipped'
    if (proposal.status === 'applied') throw new LaunchOfferError('This combo is already on your menu. Pause it in Boost Sales.', 409)
    await decideBoostAiProposal(tenant.id, ownerId, proposalId, 'reject')
    return 'skipped'
  }

  if (proposal.status === 'applied') return 'kept'
  const ctx = { client: admin as never }
  const menu = await loadLaunchMenu(ctx, tenant.id)
  const outcome = await createBoostAiProposalNow(tenant, ownerId, proposalId, ctx, { items: menu.items, lastCall: menu.lastCall })
  return outcome === 'applied' ? 'kept' : 'needs-edit'
}
