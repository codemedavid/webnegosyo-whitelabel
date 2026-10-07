/**
 * Conversations, messages and the daily budget, through the service role.
 *
 * The assistant tables grant nothing to anon/authenticated, so every query
 * here filters by tenant AND user itself: the route has already proven who the
 * caller is, and a chat is private to the person who had it.
 */

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/types/supabase'
import type { StoredMessage } from '@/lib/assistant/history'
import type { RefSnapshot } from '@/lib/assistant/refs'

const TITLE_MAX = 80
const CONVERSATION_LIST_LIMIT = 20

export interface ConversationRef {
  id: string
  refMap: unknown
}

export interface ConversationSummary {
  id: string
  title: string | null
  updatedAt: string
}

/** Null when the id is not this person's conversation in this store. */
export async function openConversation(
  tenantId: string,
  userId: string,
  conversationId: string | null,
  firstText: string,
): Promise<ConversationRef | null> {
  const admin = createAdminClient()
  if (conversationId) {
    const { data, error } = await admin
      .from('assistant_conversations')
      .select('id, ref_map')
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw new Error(`Conversation could not be read: ${error.message}`)
    // Someone else's (or another store's) conversation reads as missing.
    if (!data) return null
    return { id: data.id, refMap: data.ref_map }
  }

  const { data, error } = await admin
    .from('assistant_conversations')
    .insert({ tenant_id: tenantId, user_id: userId, title: firstText.slice(0, TITLE_MAX) || null })
    .select('id, ref_map')
    .single()
  if (error || !data) throw new Error(`Conversation could not be started: ${error?.message ?? 'no row'}`)
  return { id: data.id, refMap: data.ref_map }
}

/** The latest `limit` messages, oldest first. */
export async function loadMessages(conversationId: string, limit: number): Promise<StoredMessage[]> {
  const { data, error } = await createAdminClient()
    .from('assistant_messages')
    .select('message_id, role, parts')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`Conversation history could not be read: ${error.message}`)
  return (data ?? [])
    .reverse()
    .map((row) => ({ id: row.message_id, role: row.role as StoredMessage['role'], parts: row.parts as StoredMessage['parts'] }))
}

export interface MessageUsage {
  model: string
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  costUsd: number
}

export async function saveMessage(
  tenantId: string,
  conversationId: string,
  message: StoredMessage,
  usage?: MessageUsage,
): Promise<void> {
  const { error } = await createAdminClient()
    .from('assistant_messages')
    .upsert(
      {
        conversation_id: conversationId,
        tenant_id: tenantId,
        message_id: message.id,
        role: message.role,
        parts: message.parts as unknown as Json,
        ...(usage
          ? {
              model: usage.model,
              input_tokens: usage.inputTokens,
              cached_input_tokens: usage.cachedInputTokens,
              output_tokens: usage.outputTokens,
              cost_usd: usage.costUsd,
            }
          : {}),
      },
      { onConflict: 'conversation_id,message_id' },
    )
  if (error) throw new Error(`Message could not be saved: ${error.message}`)
}

export async function saveRefMap(conversationId: string, snapshot: RefSnapshot): Promise<void> {
  const { error } = await createAdminClient()
    .from('assistant_conversations')
    .update({ ref_map: snapshot as unknown as Json, updated_at: new Date().toISOString() })
    .eq('id', conversationId)
  if (error) throw new Error(`Conversation could not be updated: ${error.message}`)
}

export async function listConversations(tenantId: string, userId: string): Promise<ConversationSummary[]> {
  const { data, error } = await createAdminClient()
    .from('assistant_conversations')
    .select('id, title, updated_at')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(CONVERSATION_LIST_LIMIT)
  if (error) throw new Error(`Conversations could not be listed: ${error.message}`)
  return (data ?? []).map((row) => ({ id: row.id, title: row.title, updatedAt: row.updated_at }))
}

/**
 * Take one message from today's allowance. Fails CLOSED: if the budget cannot
 * be checked, the turn does not run (Redis-style fail-open would make the cap
 * meaningless exactly when something is already wrong).
 */
export async function claimAssistantTurn(tenantId: string, maxMessages: number, maxCostUsd: number): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc('claim_assistant_turn', {
    p_tenant_id: tenantId,
    p_max_messages: maxMessages,
    p_max_cost_usd: maxCostUsd,
  })
  if (error) {
    console.error('[assistant] budget claim failed', { tenantId, message: error.message })
    return false
  }
  return data === true
}

export async function recordAssistantUsage(tenantId: string, tokens: number, costUsd: number): Promise<void> {
  const { error } = await createAdminClient().rpc('record_assistant_usage', {
    p_tenant_id: tenantId,
    p_tokens: Math.max(0, Math.round(tokens)),
    p_cost_usd: Math.max(0, costUsd),
  })
  if (error) console.error('[assistant] usage record failed', { tenantId, message: error.message })
}
