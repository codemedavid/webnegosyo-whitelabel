/**
 * The browser's Messenger reference → the real PSID, on the server.
 *
 * The storefront keeps whatever the menu link carried and sends it back as
 * `messenger_psid` (checkout) or `psid` (cart sync). Since 2026-11-10 that is
 * a signed `?m=` token (`link-token.ts`) naming a `messenger_sessions` row, and
 * only a token for THIS store resolves. Raw PSIDs from menu cards sent before
 * then are still accepted until LEGACY_PSID_ACCEPTED_UNTIL (2026-11-24), and only when that
 * customer already has a session with this store (the old check).
 */

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { looksLikeMessengerLinkToken } from './link-token-shape'
import { readMessengerLinkToken } from './link-token'
import { readSessionOwner } from './session'
import { withMessengerTables } from '@/lib/messenger/db'

/**
 * Menu cards before 2026-11-10 carried the raw PSID. Kept two weeks only: the
 * check (a session exists) is weak, since knowing a PSID is enough.
 */
export const LEGACY_PSID_ACCEPTED_UNTIL = new Date('2026-11-24T00:00:00Z')
const LEGACY_PSID_PATTERN = /^\d{5,32}$/

async function hasLegacySession(tenantId: string, psid: string): Promise<boolean> {
  const { data, error } = await withMessengerTables(createAdminClient())
    .from('messenger_sessions')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('psid', psid)
    .maybeSingle()
  return !error && !!data
}

export async function resolveMessengerRecipient(
  tenantId: string,
  reference: unknown,
  now: Date = new Date(),
): Promise<string | null> {
  if (typeof reference !== 'string' || !reference) return null

  if (looksLikeMessengerLinkToken(reference)) {
    const sessionId = readMessengerLinkToken(reference, now)
    if (!sessionId) return null
    const owner = await readSessionOwner(sessionId)
    return owner && owner.tenantId === tenantId ? owner.psid : null
  }

  if (now.getTime() < LEGACY_PSID_ACCEPTED_UNTIL.getTime() && LEGACY_PSID_PATTERN.test(reference)) {
    const isKnown = await hasLegacySession(tenantId, reference)
    if (isKnown) console.warn('[Messenger] legacy raw PSID accepted (menu card sent before signed links)', { tenantId })
    return isKnown ? reference : null
  }
  return null
}

/**
 * customer_data with `messenger_psid` replaced by the verified PSID, or
 * removed when the reference does not resolve. Never mutates the input.
 */
export async function withVerifiedMessengerPsid(
  tenantId: string,
  customerData: Record<string, unknown> | undefined,
): Promise<Record<string, unknown> | undefined> {
  if (!customerData || !('messenger_psid' in customerData)) return customerData
  const { messenger_psid: reference, ...rest } = customerData
  const psid = await resolveMessengerRecipient(tenantId, reference)
  return psid ? { ...rest, messenger_psid: psid } : rest
}
