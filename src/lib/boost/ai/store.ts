/**
 * The AI generation log: every run and the offers it proposed.
 *
 * Service-role only. The rows are the store's free-generation allowance, so the
 * browser can read them but never write them (see the migration). Callers
 * check the merchant's permission before any of these run.
 *
 * Status changes are conditional updates (`status IN (...)`): two people
 * applying the same proposal at once cannot both win, and the loser learns it.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import type { BoostIdea } from '../ideas'
import { FREE_BOOST_AI_GENERATIONS, type ProposalStatus } from './lifecycle'

export type GenerationStatus = 'running' | 'succeeded' | 'failed'

export interface BoostAiProposal {
  id: string
  generationId: string
  kind: BoostIdea['kind']
  position: number
  idea: BoostIdea
  status: ProposalStatus
  decidedAt: string | null
  appliedAt: string | null
  appliedRef: string | null
}

export interface BoostAiGeneration {
  id: string
  status: GenerationStatus
  model: string | null
  dataSource: string | null
  ordersAnalyzed: number
  summary: string | null
  error: string | null
  createdAt: string
  completedAt: string | null
  proposals: BoostAiProposal[]
}

export interface BoostAiLog {
  generations: BoostAiGeneration[]
  used: number
  limit: number
}

interface ProposalRow {
  id: string
  generation_id: string
  kind: BoostIdea['kind']
  position: number
  payload: BoostIdea
  status: ProposalStatus
  decided_at: string | null
  applied_at: string | null
  applied_ref: string | null
}

interface GenerationRow {
  id: string
  status: GenerationStatus
  model: string | null
  data_source: string | null
  orders_analyzed: number
  summary: string | null
  error: string | null
  created_at: string
  completed_at: string | null
  boost_ai_proposals: ProposalRow[] | null
}

const MAX_LOGGED_GENERATIONS = 20
const MAX_ERROR_LENGTH = 500
const PROPOSAL_COLUMNS = 'id, generation_id, kind, position, payload, status, decided_at, applied_at, applied_ref'

// The generated DB types predate these tables.
function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

function toProposal(row: ProposalRow): BoostAiProposal {
  return {
    id: row.id,
    generationId: row.generation_id,
    kind: row.kind,
    position: row.position,
    idea: row.payload,
    status: row.status,
    decidedAt: row.decided_at,
    appliedAt: row.applied_at,
    appliedRef: row.applied_ref,
  }
}

function toGeneration(row: GenerationRow): BoostAiGeneration {
  return {
    id: row.id,
    status: row.status,
    model: row.model,
    dataSource: row.data_source,
    ordersAnalyzed: row.orders_analyzed,
    summary: row.summary,
    error: row.error,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    proposals: [...(row.boost_ai_proposals ?? [])].sort((a, b) => a.position - b.position).map(toProposal),
  }
}

/** Reserve one generation; null when the store's free allowance is used up. */
export async function claimBoostAiGeneration(tenantId: string, userId: string): Promise<string | null> {
  const { data, error } = await db().rpc('claim_boost_ai_generation', {
    p_tenant_id: tenantId,
    p_user_id: userId,
    p_limit: FREE_BOOST_AI_GENERATIONS,
  })
  if (error) throw new Error(`Could not start an AI generation: ${error.message}`)
  return typeof data === 'string' ? data : null
}

export interface CompletedGeneration {
  model: string
  dataSource: string
  ordersAnalyzed: number
  summary: string
  ideas: readonly BoostIdea[]
}

export async function completeBoostAiGeneration(
  tenantId: string,
  generationId: string,
  result: CompletedGeneration
): Promise<void> {
  const client = db()
  const { error: insertError } = await client.from('boost_ai_proposals').insert(
    result.ideas.map((idea, position) => ({
      generation_id: generationId,
      tenant_id: tenantId,
      kind: idea.kind,
      position,
      payload: idea,
    }))
  )
  if (insertError) throw new Error(`Could not save the AI suggestions: ${insertError.message}`)

  const { error } = await client
    .from('boost_ai_generations')
    .update({
      status: 'succeeded',
      model: result.model,
      data_source: result.dataSource,
      orders_analyzed: result.ordersAnalyzed,
      summary: result.summary || null,
      completed_at: new Date().toISOString(),
    })
    .eq('id', generationId)
    .eq('tenant_id', tenantId)
  if (error) throw new Error(`Could not finish the AI generation: ${error.message}`)
}

/** A failed run stops counting against the allowance. Never throws: it runs inside error handling. */
export async function failBoostAiGeneration(tenantId: string, generationId: string, message: string): Promise<void> {
  const { error } = await db()
    .from('boost_ai_generations')
    .update({ status: 'failed', error: message.slice(0, MAX_ERROR_LENGTH), completed_at: new Date().toISOString() })
    .eq('id', generationId)
    .eq('tenant_id', tenantId)
  if (error) console.error('[boost-ai] could not mark generation failed:', error.message)
}

export async function listBoostAiLog(tenantId: string): Promise<BoostAiLog> {
  const client = db()
  // The allowance count and the latest rows are independent reads: issue both
  // at once. Counted over the whole table, like the claim RPC — the log below
  // is only the latest rows.
  const [counted, listed] = await Promise.all([
    client
      .from('boost_ai_generations')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .in('status', ['running', 'succeeded']),
    client
      .from('boost_ai_generations')
      .select(`id, status, model, data_source, orders_analyzed, summary, error, created_at, completed_at, boost_ai_proposals(${PROPOSAL_COLUMNS})`)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(MAX_LOGGED_GENERATIONS),
  ])
  if (counted.error) throw new Error(`Could not read the AI generation log: ${counted.error.message}`)
  if (listed.error) throw new Error(`Could not read the AI generation log: ${listed.error.message}`)

  const generations = ((listed.data ?? []) as unknown as GenerationRow[]).map(toGeneration)
  return { generations, used: counted.count ?? 0, limit: FREE_BOOST_AI_GENERATIONS }
}

export async function getBoostAiProposal(tenantId: string, proposalId: string): Promise<BoostAiProposal | null> {
  const { data, error } = await db()
    .from('boost_ai_proposals')
    .select(PROPOSAL_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('id', proposalId)
    .maybeSingle()
  if (error) throw new Error(`Could not read this suggestion: ${error.message}`)
  return data ? toProposal(data as unknown as ProposalRow) : null
}

export interface ProposalStatusChange {
  to: ProposalStatus
  userId: string
  appliedRef?: string | null
}

/** Move a proposal only if it is still in one of `from`; false when someone else moved it first. */
export async function setBoostAiProposalStatus(
  tenantId: string,
  proposalId: string,
  from: readonly ProposalStatus[],
  change: ProposalStatusChange
): Promise<boolean> {
  const now = new Date().toISOString()
  const { data, error } = await db()
    .from('boost_ai_proposals')
    .update({
      status: change.to,
      decided_by: change.userId,
      decided_at: now,
      ...(change.to === 'applied' ? { applied_at: now, applied_ref: change.appliedRef ?? null } : {}),
    })
    .eq('tenant_id', tenantId)
    .eq('id', proposalId)
    .in('status', [...from])
    .select('id')
  if (error) throw new Error(`Could not update this suggestion: ${error.message}`)
  return (data ?? []).length > 0
}
