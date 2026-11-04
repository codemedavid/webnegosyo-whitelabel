/** @jest-environment node */

/**
 * Dynamic client registration (RFC 7591) is open by design — MCP clients
 * register themselves — so it is the most exposed write the OAuth server has.
 * It used to store any name and any number of any redirect URIs, unthrottled.
 * Now: name ≤100 chars, 1–10 redirect URIs ≤2048 chars each, https or http
 * loopback (plus native private-use schemes such as Cursor's `cursor://`),
 * and a per-IP rate limit.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { parseClientRegistration } from '@/lib/mcp/oauth-registration'

const CURSOR = [
  'cursor://anysphere.cursor-mcp/oauth/callback',
  'http://localhost:4567/callback',
  'https://www.cursor.com/oauth/callback',
]

describe('parseClientRegistration', () => {
  it.each([
    ['Claude', ['https://claude.ai/api/mcp/auth_callback']],
    ['ChatGPT', ['https://chatgpt.com/connector_platform_oauth_redirect']],
    ['Cursor', CURSOR],
    ['Claude Code', ['http://localhost:51234/callback']],
    ['loopback v4', ['http://127.0.0.1:55563/callback/abc']],
    ['loopback v6', ['http://[::1]:8080/callback']],
  ])('accepts the %s registration', (name, uris) => {
    const parsed = parseClientRegistration({ client_name: name, redirect_uris: uris })
    expect(parsed).toEqual({ ok: true, value: { client_name: name, redirect_uris: uris } })
  })

  it('defaults a missing name', () => {
    expect(parseClientRegistration({ redirect_uris: ['https://claude.ai/cb'] }))
      .toEqual({ ok: true, value: { client_name: 'MCP Client', redirect_uris: ['https://claude.ai/cb'] } })
  })

  it.each([
    ['a name over 100 characters', { client_name: 'x'.repeat(101), redirect_uris: ['https://a.example/cb'] }],
    ['no redirect URIs', { client_name: 'A', redirect_uris: [] }],
    ['a missing redirect_uris', { client_name: 'A' }],
    ['more than 10 redirect URIs', {
      client_name: 'A',
      redirect_uris: Array.from({ length: 11 }, (_, i) => `https://a.example/cb${i}`),
    }],
    ['a redirect URI over 2048 characters', { redirect_uris: [`https://a.example/${'x'.repeat(2040)}`] }],
    ['a non-string redirect URI', { redirect_uris: [42] }],
    ['plain http to a public host', { redirect_uris: ['http://evil.example/cb'] }],
    ['http to a loopback look-alike', { redirect_uris: ['http://localhost.evil.example/cb'] }],
    ['javascript:', { redirect_uris: ['javascript:alert(1)'] }],
    ['data:', { redirect_uris: ['data:text/html,<script>alert(1)</script>'] }],
    ['file:', { redirect_uris: ['file:///etc/passwd'] }],
    ['a relative URI', { redirect_uris: ['/callback'] }],
    ['a URI with a fragment', { redirect_uris: ['https://a.example/cb#frag'] }],
    ['a URI with credentials', { redirect_uris: ['https://user:pass@a.example/cb'] }],
    ['one bad URI among good ones', { redirect_uris: ['https://a.example/cb', 'http://evil.example/cb'] }],
    ['a non-object body', null],
  ])('refuses %s', (_label, body) => {
    const parsed = parseClientRegistration(body)
    expect(parsed.ok).toBe(false)
  })
})

describe('POST /api/mcp/oauth/register', () => {
  const insert = jest.fn()
  const checkRateLimit = jest.fn<(...args: unknown[]) => Promise<unknown>>()

  beforeEach(() => {
    jest.resetModules()
    insert.mockReset()
    checkRateLimit.mockReset().mockResolvedValue({ allowed: true, remaining: 5, retryAfterSec: 60 })
    jest.doMock('@/lib/distributed-rate-limit', () => ({
      checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
    }))
    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: () => ({
        from: () => ({
          insert: (row: Record<string, unknown>) => {
            insert(row)
            return { select: () => ({ single: async () => ({ data: row, error: null }) }) }
          },
        }),
      }),
    }))
  })

  function register(body: unknown, ip = '203.0.113.9') {
    return new Request('https://store.example/api/mcp/oauth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify(body),
    })
  }

  it('registers a valid client, rate limited per IP', async () => {
    const { POST } = await import('@/app/api/mcp/oauth/register/route')
    const response = await POST(register({ client_name: 'Cursor', redirect_uris: CURSOR }))

    expect(response.status).toBe(201)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ client_name: 'Cursor', redirect_uris: CURSOR }))
    expect(checkRateLimit).toHaveBeenCalledWith('mcp-register:203.0.113.9', expect.anything())
  })

  it('answers 429 without writing once the IP is over its limit', async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 120 })
    const { POST } = await import('@/app/api/mcp/oauth/register/route')
    const response = await POST(register({ client_name: 'A', redirect_uris: ['https://a.example/cb'] }))

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('120')
    expect(insert).not.toHaveBeenCalled()
  })

  it('answers invalid_redirect_uri without writing for a disallowed URI', async () => {
    const { POST } = await import('@/app/api/mcp/oauth/register/route')
    const response = await POST(register({ client_name: 'A', redirect_uris: ['http://evil.example/cb'] }))

    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('invalid_redirect_uri')
    expect(insert).not.toHaveBeenCalled()
  })

  it('answers invalid_client_metadata for an oversized name', async () => {
    const { POST } = await import('@/app/api/mcp/oauth/register/route')
    const response = await POST(register({ client_name: 'x'.repeat(101), redirect_uris: ['https://a.example/cb'] }))

    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('invalid_client_metadata')
    expect(insert).not.toHaveBeenCalled()
  })
})
