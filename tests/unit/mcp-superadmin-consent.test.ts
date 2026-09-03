import { describe, expect, it, jest } from '@jest/globals'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  decideSuperadminConsent,
  loadSuperadminConsent,
} from '@/lib/mcp/superadmin-consent'
import type { Database } from '@/types/database'

function consentClient(options: {
  user?: { id: string } | null
  role?: string | null
  roleError?: unknown
  details?: unknown
  detailsError?: unknown
  decisionError?: unknown
} = {}) {
  class ConsentRoleQuery {
    select = jest.fn(() => this)
    eq = jest.fn(() => this)
    maybeSingle = jest.fn(async () => ({
      data: options.role === null ? null : { role: options.role ?? 'superadmin' },
      error: options.roleError ?? null,
    }))
  }

  const query = new ConsentRoleQuery()

  const details = options.details ?? {
    authorization_id: 'auth_1',
    client: { name: 'ChatGPT' },
    redirect_uri: 'https://chatgpt.com/callback',
    scope: 'openid',
  }
  const client = {
    auth: {
      getUser: jest.fn(async () => ({
        data: {
          user: options.user === null ? null : options.user ?? { id: 'user_1' },
        },
      })),
      oauth: {
        getAuthorizationDetails: jest.fn(async (authorizationId: string) => {
          void authorizationId
          return { data: details, error: options.detailsError ?? null }
        }),
        approveAuthorization: jest.fn(async (authorizationId: string) => {
          void authorizationId
          return {
            data: options.decisionError
              ? null
              : { redirect_url: 'https://chatgpt.com/approved' },
            error: options.decisionError ?? null,
          }
        }),
        denyAuthorization: jest.fn(async (authorizationId: string) => {
          void authorizationId
          return {
            data: options.decisionError
              ? null
              : { redirect_url: 'https://chatgpt.com/denied' },
            error: options.decisionError ?? null,
          }
        }),
      },
    },
    from: jest.fn(() => query),
  }
  return client as unknown as typeof client & SupabaseClient<Database>
}

const clientWithoutUser = () => consentClient({ user: null })
const clientForRole = (role: string) => consentClient({ role })
const clientForSuperadmin = () => consentClient()

describe('superadmin MCP OAuth consent', () => {
  it('redirects an anonymous visitor to superadmin login with authorization_id preserved', async () => {
    const result = await loadSuperadminConsent(clientWithoutUser(), 'auth_1')

    expect(result).toEqual({
      kind: 'login',
      href: '/superadmin/login?redirect=%2Fsuperadmin%2Fmcp%2Fauthorize%3Fauthorization_id%3Dauth_1',
    })
  })

  it('refuses consent details to a signed-in non-superadmin', async () => {
    const client = clientForRole('admin')

    await expect(loadSuperadminConsent(client, 'auth_1')).resolves.toEqual({
      kind: 'forbidden',
    })
    expect(client.auth.oauth.getAuthorizationDetails).not.toHaveBeenCalled()
  })

  it('fails closed when the current role cannot be read', async () => {
    const client = consentClient({ roleError: { message: 'database unavailable' } })

    await expect(loadSuperadminConsent(client, 'auth_1')).resolves.toEqual({
      kind: 'forbidden',
    })
    expect(client.auth.oauth.getAuthorizationDetails).not.toHaveBeenCalled()
  })

  it('returns client and scopes to a signed-in superadmin', async () => {
    await expect(loadSuperadminConsent(clientForSuperadmin(), 'auth_1')).resolves.toMatchObject({
      kind: 'consent',
      authorizationId: 'auth_1',
      clientName: 'ChatGPT',
      redirectUri: 'https://chatgpt.com/callback',
      scopes: ['openid'],
    })
  })

  it.each(['approve', 'deny'] as const)('rechecks the role before %s', async (decision) => {
    const client = clientForRole('admin')

    await expect(decideSuperadminConsent(client, 'auth_1', decision)).resolves.toEqual({
      kind: 'forbidden',
    })
    expect(client.auth.oauth.approveAuthorization).not.toHaveBeenCalled()
    expect(client.auth.oauth.denyAuthorization).not.toHaveBeenCalled()
  })

  it('rejects a missing authorization ID without calling Supabase OAuth', async () => {
    const client = clientForSuperadmin()

    await expect(loadSuperadminConsent(client, '')).resolves.toEqual({
      kind: 'error',
      message: 'Missing authorization request.',
    })
    expect(client.auth.getUser).not.toHaveBeenCalled()
    expect(client.auth.oauth.getAuthorizationDetails).not.toHaveBeenCalled()
  })

  it.each([
    '../auth_1',
    'auth_1?decision=approve',
    'auth_1#fragment',
    'auth/request',
    'auth request',
    'auth%2Frequest',
    'a'.repeat(257),
  ])('rejects malformed authorization ID %s before loading the session', async (authorizationId) => {
    const client = clientForSuperadmin()

    await expect(loadSuperadminConsent(client, authorizationId)).resolves.toEqual({
      kind: 'error',
      message: 'Invalid authorization request.',
    })
    expect(client.auth.getUser).not.toHaveBeenCalled()
    expect(client.auth.oauth.getAuthorizationDetails).not.toHaveBeenCalled()
  })

  it('returns a safe error for an invalid or expired request', async () => {
    const client = consentClient({ details: null, detailsError: { message: 'expired' } })

    await expect(loadSuperadminConsent(client, 'auth_1')).resolves.toEqual({
      kind: 'error',
      message: 'Invalid or expired authorization request.',
    })
  })

  it('uses Supabase redirect when authorization was already decided', async () => {
    const client = consentClient({
      details: { redirect_url: 'https://chatgpt.com/already-decided' },
    })

    await expect(loadSuperadminConsent(client, 'auth_1')).resolves.toEqual({
      kind: 'redirect',
      href: 'https://chatgpt.com/already-decided',
    })
  })

  it.each([
    ['approve', 'https://chatgpt.com/approved'],
    ['deny', 'https://chatgpt.com/denied'],
  ] as const)('returns the Supabase redirect after %s', async (decision, href) => {
    const client = clientForSuperadmin()

    await expect(decideSuperadminConsent(client, 'auth_1', decision)).resolves.toEqual({
      kind: 'redirect',
      href,
    })
    expect(client.auth.oauth[`${decision}Authorization`]).toHaveBeenCalledWith('auth_1')
  })

  it('returns a safe error when Supabase rejects the decision', async () => {
    const client = consentClient({ decisionError: { message: 'already decided' } })

    await expect(decideSuperadminConsent(client, 'auth_1', 'approve')).resolves.toEqual({
      kind: 'error',
      message: 'Authorization decision failed.',
    })
  })

  it.each([
    '../auth_1',
    'auth_1?decision=approve',
    'auth_1#fragment',
    'auth/request',
    'auth request',
    'auth%2Frequest',
    'a'.repeat(257),
  ])('rejects malformed decision ID %s before loading the session', async (authorizationId) => {
    const client = clientForSuperadmin()

    await expect(decideSuperadminConsent(client, authorizationId, 'approve')).resolves.toEqual({
      kind: 'error',
      message: 'Invalid authorization request.',
    })
    expect(client.auth.getUser).not.toHaveBeenCalled()
    expect(client.auth.oauth.approveAuthorization).not.toHaveBeenCalled()
  })
})
