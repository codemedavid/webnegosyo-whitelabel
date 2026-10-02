'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { verifyTenantPermission } from '@/lib/admin-service'
import { getCachedTenantBySlug } from '@/lib/cache'
import { setBoostAiProposalStatus } from '@/lib/boost/ai/store'
import { FREE_BOOST_AI_GENERATIONS } from '@/lib/boost/ai/lifecycle'
import {
  applyBoostAiProposal,
  decideBoostAiProposal,
  generateBoostAiProposals,
} from '@/lib/boost/ai/service'

// No `export type` here: a type re-export from a 'use server' file passes
// dev and tsc but breaks `next build`.

type ActionResult<T = undefined> = { success: true; data?: T } | { success: false; error: string }

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ZodError) return error.issues[0]?.message ?? fallback
  if (error instanceof Error && error.message) return error.message
  return fallback
}

/** The slug only names pages to refresh; it must belong to the tenant the permission was checked on. */
async function loadTenant(tenantId: string, tenantSlug: string) {
  const tenant = await getCachedTenantBySlug(tenantSlug)
  if (!tenant || tenant.id !== tenantId) throw new Error('Store not found')
  return tenant
}

function boostPath(tenantSlug: string): string {
  return `/${tenantSlug}/admin/boost-sales`
}

export async function generateBoostAiAction(
  tenantId: string,
  tenantSlug: string
): Promise<ActionResult<{ generationId: string; proposals: number }>> {
  try {
    const { user } = await verifyTenantPermission(tenantId, 'analytics')
    const tenant = await loadTenant(tenantId, tenantSlug)

    const outcome = await generateBoostAiProposals(tenant, user.id)

    revalidatePath(boostPath(tenantSlug))
    if (outcome.status === 'quota_exhausted') {
      return { success: false, error: `You have used all ${FREE_BOOST_AI_GENERATIONS} free AI generations for this store.` }
    }
    if (outcome.status === 'failed') return { success: false, error: outcome.error }
    return { success: true, data: { generationId: outcome.generationId, proposals: outcome.proposals } }
  } catch (error) {
    console.error('[boost-ai] generate:', error)
    return { success: false, error: errorMessage(error, 'Could not generate suggestions') }
  }
}

export async function decideBoostAiProposalAction(
  tenantId: string,
  tenantSlug: string,
  proposalId: string,
  decision: 'approve' | 'reject'
): Promise<ActionResult> {
  try {
    const { user } = await verifyTenantPermission(tenantId, 'analytics')
    if (!uuid.test(proposalId) || (decision !== 'approve' && decision !== 'reject')) {
      throw new Error('Invalid request')
    }
    await decideBoostAiProposal(tenantId, user.id, proposalId, decision)

    revalidatePath(boostPath(tenantSlug))
    return { success: true }
  } catch (error) {
    console.error('[boost-ai] decide:', error)
    return { success: false, error: errorMessage(error, 'Could not update this suggestion') }
  }
}

/** Apply an approved proposal (see `applyBoostAiProposal` for the claim-first guard). */
export async function applyBoostAiProposalAction(
  tenantId: string,
  tenantSlug: string,
  proposalId: string
): Promise<ActionResult<{ status: 'applied' | 'needs-edit' }>> {
  try {
    const { user } = await verifyTenantPermission(tenantId, 'analytics')
    if (!uuid.test(proposalId)) throw new Error('Invalid request')
    const tenant = await loadTenant(tenantId, tenantSlug)
    const status = await applyBoostAiProposal(tenant, user.id, proposalId)
    return { success: true, data: { status } }
  } catch (error) {
    console.error('[boost-ai] apply:', error)
    return { success: false, error: errorMessage(error, 'Could not apply this suggestion') }
  }
}

/** The merchant edited an approved proposal in the offer editor and saved it — record it as applied. */
export async function markBoostAiProposalAppliedAction(
  tenantId: string,
  tenantSlug: string,
  proposalId: string
): Promise<ActionResult> {
  try {
    const { user } = await verifyTenantPermission(tenantId, 'analytics')
    if (!uuid.test(proposalId)) throw new Error('Invalid request')
    const moved = await setBoostAiProposalStatus(tenantId, proposalId, ['approved'], { to: 'applied', userId: user.id })
    if (!moved) throw new Error('This suggestion was already applied or changed')
    revalidatePath(boostPath(tenantSlug))
    return { success: true }
  } catch (error) {
    console.error('[boost-ai] mark applied:', error)
    return { success: false, error: errorMessage(error, 'Could not record this suggestion as applied') }
  }
}
