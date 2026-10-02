/**
 * The Boost Sales AI operations, once, for both callers:
 *
 *   - the web's Boost Sales screen (server actions, cookie session), and
 *   - the merchant app's Growth tab (`/api/boost/ai`, bearer token).
 *
 * Callers authorize first. The app route passes a `ProvisioningCtx` so the
 * offer writes run on the service-role client its own check vouched for; the
 * web passes none and each write re-checks the cookie session as before.
 */

import { invalidateTenantCache } from '@/lib/cache'
import { openRouterChat } from '@/lib/ai/openrouter'
import type { ProvisioningCtx } from '@/lib/provisioning/context'
import { getBoostMenu, getBoostWorkspace, type BoostTenantFields } from '../workspace'
import { readBasketSummary } from '../order-baskets'
import { refreshOfferCaches } from '../refresh-offer-caches'
import { runBoostAiGeneration, type GenerationOutcome } from './generate'
import { applyBoostIdea } from './apply'
import {
  BOOST_AI_FALLBACK_MODEL,
  BOOST_AI_MAX_TOKENS,
  BOOST_AI_MODEL,
  BOOST_AI_TIMEOUT_MS,
} from './prompt'
import {
  claimBoostAiGeneration,
  completeBoostAiGeneration,
  failBoostAiGeneration,
  getBoostAiProposal,
  setBoostAiProposalStatus,
  type BoostAiProposal,
} from './store'
import { canApplyProposal, decideProposal, planOneTapCreate, type ProposalDecision } from './lifecycle'

export interface BoostAiTenant extends BoostTenantFields {
  slug: string
}

export type ApplyOutcome = 'applied' | 'needs-edit'

export function generateBoostAiProposals(tenant: BoostAiTenant, userId: string): Promise<GenerationOutcome> {
  return runBoostAiGeneration({
    claim: () => claimBoostAiGeneration(tenant.id, userId),
    loadWorkspace: () => getBoostWorkspace(tenant),
    loadBaskets: () => readBasketSummary(tenant.id),
    callModel: (messages) => openRouterChat({
      model: BOOST_AI_MODEL,
      fallbackModel: BOOST_AI_FALLBACK_MODEL,
      messages,
      maxTokens: BOOST_AI_MAX_TOKENS,
      timeoutMs: BOOST_AI_TIMEOUT_MS,
      title: 'WebNegosyo Boost Sales',
    }),
    complete: (generationId, result) => completeBoostAiGeneration(tenant.id, generationId, result),
    fail: (generationId, message) => failBoostAiGeneration(tenant.id, generationId, message),
  })
}

export async function loadBoostAiProposal(tenantId: string, proposalId: string): Promise<BoostAiProposal> {
  const proposal = await getBoostAiProposal(tenantId, proposalId)
  if (!proposal) throw new Error('This suggestion no longer exists')
  return proposal
}

export async function decideBoostAiProposal(
  tenantId: string,
  userId: string,
  proposalId: string,
  decision: ProposalDecision
): Promise<void> {
  const proposal = await loadBoostAiProposal(tenantId, proposalId)
  const next = decideProposal(proposal.status, decision)
  if (!next) throw new Error(`This suggestion is already ${proposal.status}`)
  const moved = await setBoostAiProposalStatus(tenantId, proposalId, [proposal.status], { to: next, userId })
  if (!moved) throw new Error('Someone else just changed this suggestion. Refresh to see it.')
}

/**
 * Apply an approved proposal. The status is claimed FIRST (approved → applied)
 * so two taps, or two people, cannot both create the offer; a failed write
 * hands the proposal back as approved.
 */
export async function applyBoostAiProposal(
  tenant: BoostAiTenant,
  userId: string,
  proposalId: string,
  ctx?: ProvisioningCtx
): Promise<ApplyOutcome> {
  const proposal = await loadBoostAiProposal(tenant.id, proposalId)
  if (!canApplyProposal(proposal.status)) {
    throw new Error(proposal.status === 'applied' ? 'This suggestion is already live' : 'Approve this suggestion before applying it')
  }

  const claimed = await setBoostAiProposalStatus(tenant.id, proposalId, ['approved'], { to: 'applied', userId })
  if (!claimed) throw new Error('This suggestion was just applied or changed. Refresh to see it.')

  try {
    const result = await applyBoostIdea(tenant.id, proposal.idea, await getBoostMenu(tenant), ctx)
    if (result.status === 'needs-edit') {
      await setBoostAiProposalStatus(tenant.id, proposalId, ['applied'], { to: 'approved', userId })
      return 'needs-edit'
    }
    await setBoostAiProposalStatus(tenant.id, proposalId, ['applied'], { to: 'applied', userId, appliedRef: result.ref })
  } catch (error) {
    await setBoostAiProposalStatus(tenant.id, proposalId, ['applied'], { to: 'approved', userId })
    throw error
  }

  if (proposal.kind === 'last_call') await invalidateTenantCache(tenant.slug, tenant.id)
  await refreshOfferCaches(tenant.id, tenant.slug)
  return 'applied'
}

/** The app's one-tap "Create it": approve when needed, then apply. */
export async function createBoostAiProposalNow(
  tenant: BoostAiTenant,
  userId: string,
  proposalId: string,
  ctx?: ProvisioningCtx
): Promise<ApplyOutcome> {
  const proposal = await loadBoostAiProposal(tenant.id, proposalId)
  const plan = planOneTapCreate(proposal.status)
  if (!plan.ok) throw new Error(plan.error)
  if (plan.approveFirst) await decideBoostAiProposal(tenant.id, userId, proposalId, 'approve')
  return applyBoostAiProposal(tenant, userId, proposalId, ctx)
}
