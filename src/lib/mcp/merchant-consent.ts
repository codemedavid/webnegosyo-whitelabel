import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export const CONSENT_TTL_SECONDS = 600
const PENDING_SCOPE = 'pending_consent'
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

export interface MerchantConsentContext {
  clientId: string
  redirectUri: string
  userId: string
  tenantId: string
  /** Includes the exact PKCE challenge, scope, resource, state and client. */
  authorizationQuery: string
}

function binding(nonce: string, context: MerchantConsentContext): string {
  return hash(JSON.stringify([nonce, context]))
}

/**
 * The existing code ledger also holds pending approvals. Their distinct scope
 * is rejected by exchangeAuthorizationCode, so these rows can never be used as
 * OAuth grants. This keeps consent single-use across workers without a new
 * database or an optional cache dependency.
 */
export async function beginMerchantConsent(client: SupabaseClient, context: MerchantConsentContext) {
  const nonce = randomBytes(32).toString('base64url')
  const token = binding(nonce, context)
  const { error } = await client.from('mcp_oauth_codes').insert({
    code_hash: hash(nonce),
    client_id: context.clientId,
    redirect_uri: context.redirectUri,
    code_challenge: token,
    code_challenge_method: 'S256',
    scope: PENDING_SCOPE,
    created_by: context.userId,
    tenant_id: context.tenantId,
    expires_at: new Date(Date.now() + CONSENT_TTL_SECONDS * 1000).toISOString(),
  })
  if (error) throw new Error('Could not prepare authorization consent')
  return { nonce, token }
}

/** Validate the browser/session binding, then atomically burn this approval. */
export async function consumeMerchantConsent(
  client: SupabaseClient,
  context: MerchantConsentContext,
  nonce: string,
  token: string,
): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(token)) return false
  if (!timingSafeEqual(Buffer.from(token), Buffer.from(binding(nonce, context)))) return false

  const now = new Date().toISOString()
  const { data, error } = await client.from('mcp_oauth_codes')
    .update({ consumed_at: now })
    .eq('code_hash', hash(nonce))
    .eq('scope', PENDING_SCOPE)
    .eq('code_challenge', token)
    .eq('created_by', context.userId)
    .eq('tenant_id', context.tenantId)
    .is('consumed_at', null)
    .gt('expires_at', now)
    .select('id')
    .maybeSingle()
  return !error && Boolean(data)
}

export function consentCookieName(origin: string): string {
  return origin.startsWith('https:') ? '__Host-mcp-consent' : 'mcp-consent'
}

export function consentCookie(origin: string, nonce: string, maxAge = CONSENT_TTL_SECONDS): string {
  return `${consentCookieName(origin)}=${nonce}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${origin.startsWith('https:') ? '; Secure' : ''}`
}

export function readConsentNonce(request: Request, origin: string): string {
  const name = `${consentCookieName(origin)}=`
  return request.headers.get('cookie')?.split(';').map(part => part.trim())
    .find(part => part.startsWith(name))?.slice(name.length) ?? ''
}
