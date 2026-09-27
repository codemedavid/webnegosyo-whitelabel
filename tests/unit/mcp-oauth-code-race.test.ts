/** @jest-environment node */
import { createHash } from 'crypto'
import { exchangeAuthorizationCode } from '@/lib/mcp/oauth-service'

it('issues only one credential pair when two requests redeem the same code concurrently', async () => {
  const now = Date.now()
  const verifier = 'v'.repeat(64)
  const stored = {
    id: 'code', client_id: 'client', redirect_uri: 'https://client.example/callback',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256', scope: 'tenant_admin', created_by: 'user',
    tenant_id: 'tenant', consumed_at: null as string | null, expires_at: new Date(now + 60_000).toISOString(),
  }
  const issued: string[] = []
  // Each read snapshots the same unused code. Conditions are evaluated when
  // the update executes, reproducing the database's atomic UPDATE predicate.
  const client = { from: (table: string) => {
    let update: { consumed_at: string } | null = null
    let unusedOnly = false
    const finish = async () => {
      if (!update) return { data: { ...stored }, error: null }
      if (unusedOnly && stored.consumed_at !== null) return { data: null, error: null }
      stored.consumed_at = update.consumed_at
      return { data: { id: stored.id }, error: null }
    }
    const query = {
      select: () => query,
      eq: () => query,
      gt: () => query,
      is: (key: string, value: unknown) => { if (key === 'consumed_at' && value === null) unusedOnly = true; return query },
      update: (value: { consumed_at: string }) => { update = value; return query },
      insert: async () => { issued.push(table); return { error: null } },
      maybeSingle: finish,
      single: finish,
    }
    return query
  } }
  const input = { code: 'plain', clientId: 'client', redirectUri: stored.redirect_uri, codeVerifier: verifier }
  const options = { now, accessTtlSeconds: 3600, refreshTtlSeconds: 3600, audience: 'https://issuer.example/mcp', issuer: 'https://issuer.example' }
  const results = await Promise.allSettled([
    exchangeAuthorizationCode(client as never, input, options),
    exchangeAuthorizationCode(client as never, input, options),
  ])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
  expect(issued).toEqual(['mcp_api_keys', 'mcp_oauth_tokens'])
})
