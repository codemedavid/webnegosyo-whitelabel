/**
 * Proposed changes, stored server-side so the Confirm tap executes exactly
 * what was shown — never a payload the browser sends back.
 */

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/types/supabase'
import { ACTION_TTL_MS, type ActionKind } from '@/lib/assistant/actions/kinds'

export type ActionStatus = 'pending' | 'executing' | 'applied' | 'failed' | 'cancelled' | 'expired'

export interface StoredAction {
  id: string
  tenantId: string
  conversationId: string | null
  createdBy: string
  kind: ActionKind
  payload: unknown
  summary: string
  status: ActionStatus
  expiresAt: string
}

export async function createPendingAction(params: {
  tenantId: string
  conversationId: string | null
  createdBy: string
  kind: ActionKind
  payload: unknown
  summary: string
}): Promise<{ id: string; expiresAt: string }> {
  const expiresAt = new Date(Date.now() + ACTION_TTL_MS).toISOString()
  const { data, error } = await createAdminClient()
    .from('assistant_actions')
    .insert({
      tenant_id: params.tenantId,
      conversation_id: params.conversationId,
      created_by: params.createdBy,
      kind: params.kind,
      payload: params.payload as Json,
      summary: params.summary,
      expires_at: expiresAt,
    })
    .select('id, expires_at')
    .single()
  if (error || !data) throw new Error(`Proposal could not be saved: ${error?.message ?? 'no row'}`)
  return { id: data.id, expiresAt: data.expires_at }
}

export async function loadAction(tenantId: string, actionId: string): Promise<StoredAction | null> {
  const { data, error } = await createAdminClient()
    .from('assistant_actions')
    .select('id, tenant_id, conversation_id, created_by, kind, payload, summary, status, expires_at')
    .eq('id', actionId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) throw new Error(`Proposal could not be read: ${error.message}`)
  if (!data) return null
  return {
    id: data.id,
    tenantId: data.tenant_id,
    conversationId: data.conversation_id,
    createdBy: data.created_by,
    kind: data.kind as ActionKind,
    payload: data.payload,
    summary: data.summary,
    status: data.status as ActionStatus,
    expiresAt: data.expires_at,
  }
}

/**
 * Compare-and-set out of `pending`. Only one tap can win: a double click, two
 * tabs, or a replay all find the row already moved and change nothing.
 * Returns false when the row was not pending (or had expired).
 */
export async function moveAction(
  tenantId: string,
  actionId: string,
  to: Exclude<ActionStatus, 'pending'>,
  userId: string,
): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from('assistant_actions')
    .update({ status: to, decided_by: userId, decided_at: new Date().toISOString() })
    .eq('id', actionId)
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .select('id')
  if (error) throw new Error(`Proposal could not be updated: ${error.message}`)
  return (data ?? []).length === 1
}

export async function finishAction(
  tenantId: string,
  actionId: string,
  outcome: { status: 'applied' | 'failed'; resultRef?: string | null; error?: string },
): Promise<void> {
  const { error } = await createAdminClient()
    .from('assistant_actions')
    .update({ status: outcome.status, result_ref: outcome.resultRef ?? null, error: outcome.error ?? null })
    .eq('id', actionId)
    .eq('tenant_id', tenantId)
    .eq('status', 'executing')
  if (error) console.error('[assistant] could not record proposal outcome', { actionId, message: error.message })
}

/** Current status of every proposal in a conversation, for re-telling the model. */
export async function loadActionStatuses(conversationId: string): Promise<Map<string, ActionStatus>> {
  const { data, error } = await createAdminClient()
    .from('assistant_actions')
    .select('id, status, expires_at')
    .eq('conversation_id', conversationId)
    .limit(200)
  if (error) {
    console.error('[assistant] proposal statuses unreadable', { conversationId, message: error.message })
    return new Map()
  }
  const now = Date.now()
  return new Map(
    (data ?? []).map((row) => [
      row.id,
      (row.status === 'pending' && Date.parse(row.expires_at) <= now ? 'expired' : row.status) as ActionStatus,
    ]),
  )
}

/**
 * Cancels this person's other pending proposals of one kind in a conversation,
 * so only the newest card can be confirmed (two overlapping photo imports
 * confirmed back to back would otherwise both add the same dishes).
 */
export async function cancelOtherPending(params: {
  tenantId: string
  conversationId: string
  userId: string
  kind: ActionKind
  keepId: string
}): Promise<void> {
  const { error } = await createAdminClient()
    .from('assistant_actions')
    .update({ status: 'cancelled', decided_by: params.userId, decided_at: new Date().toISOString() })
    .eq('tenant_id', params.tenantId)
    .eq('conversation_id', params.conversationId)
    .eq('created_by', params.userId)
    .eq('kind', params.kind)
    .eq('status', 'pending')
    .neq('id', params.keepId)
  if (error) throw new Error(`Earlier proposals could not be cancelled: ${error.message}`)
}
