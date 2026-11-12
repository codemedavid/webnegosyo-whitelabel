/**
 * Push a store's rules to its Page's Messenger Profile and record the result.
 * Service role: the sync state and the page token are not staff-readable.
 */

import 'server-only'
import { messengerDb } from './service-db'
import { getTenantActivePageById } from '@/lib/facebook/page-tokens'
import { activeRules, loadMessengerSettingsAndRules } from './load-store'
import { planProfileSync } from './profile'
import { callMessengerProfile } from './send'

export type ProfileSyncOutcome = 'unchanged' | 'synced' | 'no_page' | 'failed'

async function recordSync(tenantId: string, patch: Record<string, unknown>): Promise<void> {
  const { data, error } = await messengerDb()
    .from('messenger_settings')
    .update(patch as never)
    .eq('tenant_id', tenantId)
    .select('tenant_id')
  if (error || !data || data.length !== 1) {
    console.error('[Messenger] profile sync state not stored', { tenantId, code: error?.code, message: error?.message })
  }
}

export async function syncMessengerProfile(tenantId: string, facebookPageRowId: string | null): Promise<{ outcome: ProfileSyncOutcome; error?: string }> {
  const { settings, storedRules } = await loadMessengerSettingsAndRules(tenantId)
  const plan = planProfileSync(activeRules(settings, storedRules), { hash: settings.profileHash, fields: settings.profileFields })
  if (!plan) return { outcome: 'unchanged' }

  const page = facebookPageRowId ? await getTenantActivePageById(tenantId, facebookPageRowId) : null
  if (!page) return { outcome: 'no_page' }

  if (plan.remove.length > 0) {
    const removed = await callMessengerProfile(page.page_access_token, 'DELETE', { fields: plan.remove })
    if (!removed.ok) {
      const message = `Couldn't update the Page's Messenger buttons: ${removed.error.message ?? 'Facebook refused'}`
      await recordSync(tenantId, { profile_error: message.slice(0, 500) })
      return { outcome: 'failed', error: message }
    }
  }
  if (plan.set) {
    const set = await callMessengerProfile(page.page_access_token, 'POST', plan.set)
    if (!set.ok) {
      const message = `Couldn't update the Page's Messenger buttons: ${set.error.message ?? 'Facebook refused'}`
      await recordSync(tenantId, { profile_error: message.slice(0, 500) })
      return { outcome: 'failed', error: message }
    }
  }

  await recordSync(tenantId, {
    profile_hash: plan.hash,
    profile_fields: plan.fields,
    profile_synced_at: new Date().toISOString(),
    profile_error: null,
  })
  return { outcome: 'synced' }
}
