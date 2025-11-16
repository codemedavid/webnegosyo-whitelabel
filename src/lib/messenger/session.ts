/**
 * Messenger Session Management
 * Handles user session persistence and retrieval
 */

import { createClient } from '@/lib/supabase/server'
import type {
  MessengerSession,
  MessengerCartItem,
  MessengerCheckoutState,
  MessengerSessionState,
} from '@/types/messenger'

/**
 * Get or create a Messenger session for a user
 */
export async function getOrCreateSession(
  psid: string,
  tenantId: string
): Promise<MessengerSession> {
  const supabase = await createClient()

  // Try to get existing session
  const { data: existing } = await supabase
    .from('messenger_sessions')
    .select('*')
    .eq('psid', psid)
    .single()

  if (existing) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = existing as any
    return {
      id: row.id,
      psid: row.psid,
      tenant_id: row.tenant_id,
      cart_data: (row.cart_data as MessengerCartItem[]) || [],
      checkout_state: (row.checkout_state as MessengerCheckoutState) || {},
      state: row.state as MessengerSessionState,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  }

  // Create new session
  const { data: newSession, error } = await supabase
    .from('messenger_sessions')
    // @ts-expect-error - messenger_sessions table not in generated types yet
    .insert({
      psid,
      tenant_id: tenantId,
      state: 'menu',
      cart_data: [],
      checkout_state: {},
    })
    .select()
    .single()

  if (error || !newSession) {
    throw new Error(`Failed to create session: ${error?.message || 'Unknown error'}`)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = newSession as any
  return {
    id: row.id,
    psid: row.psid,
    tenant_id: row.tenant_id,
    cart_data: (row.cart_data as MessengerCartItem[]) || [],
    checkout_state: (row.checkout_state as MessengerCheckoutState) || {},
    state: row.state as MessengerSessionState,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

/**
 * Update session data
 */
export async function updateSession(
  psid: string,
  updates: {
    cart_data?: MessengerCartItem[]
    checkout_state?: MessengerCheckoutState
    state?: MessengerSessionState
  }
): Promise<void> {
  const supabase = await createClient()

  const updateData: {
    cart_data?: unknown
    checkout_state?: unknown
    state?: string
    updated_at: string
  } = {
    updated_at: new Date().toISOString(),
  }

  if (updates.cart_data !== undefined) {
    updateData.cart_data = updates.cart_data
  }

  if (updates.checkout_state !== undefined) {
    updateData.checkout_state = updates.checkout_state
  }

  if (updates.state !== undefined) {
    updateData.state = updates.state
  }

  const { error } = await supabase
    .from('messenger_sessions')
    // @ts-expect-error - messenger_sessions table not in generated types yet
    .update(updateData)
    .eq('psid', psid)

  if (error) {
    throw new Error(`Failed to update session: ${error.message}`)
  }
}

/**
 * Resolve tenant ID for a user
 * Checks existing session first, then tries to match by page ID, then falls back to first active tenant
 */
export async function resolveTenant(psid: string, pageId?: string): Promise<string | null> {
  const supabase = await createClient()

  // Check existing session
  const { data: session } = await supabase
    .from('messenger_sessions')
    .select('tenant_id')
    .eq('psid', psid)
    .single()

  if (session) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (session as any).tenant_id
  }

  // If we have page ID, match tenant by messenger_page_id
  if (pageId) {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('messenger_page_id', pageId)
      .eq('is_active', true)
      .single()

    if (tenant) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (tenant as any).id
    }
  }

  // Get first active tenant (in production, you might want user to select)
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id')
    .eq('is_active', true)
    .limit(1)
    .order('created_at', { ascending: true })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return tenants?.[0] ? (tenants[0] as any).id : null
}

/**
 * Clear session (useful for resetting user state)
 */
export async function clearSession(psid: string): Promise<void> {
  const supabase = await createClient()

  await supabase
    .from('messenger_sessions')
    // @ts-expect-error - messenger_sessions table not in generated types yet
    .update({
      cart_data: [],
      checkout_state: {},
      state: 'menu',
      updated_at: new Date().toISOString(),
    })
    .eq('psid', psid)
}

