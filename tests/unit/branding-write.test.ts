/**
 * The privileged (MCP / provisioning) branding write. It lives outside the
 * `'use server'` action module on purpose: every export of an action module is
 * a public endpoint, so a "pass a ctx to skip auth" parameter there let any
 * browser skip `store_setup`. This module is only reachable from server code
 * that has already authorized the caller.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals'

jest.mock('@/lib/branding-service', () => ({ writeBrandingWithClient: jest.fn() }))
jest.mock('@/lib/cache', () => ({ invalidateTenantCache: jest.fn() }))

function clientWithSlug(slug: unknown) {
  const maybeSingle = jest.fn(async () => ({ data: slug === undefined ? null : { slug }, error: null }))
  const eq = jest.fn(() => ({ maybeSingle }))
  const select = jest.fn(() => ({ eq }))
  const from = jest.fn(() => ({ select }))
  return { from } as never
}

async function load() {
  const branding = await import('@/lib/branding-service')
  const cache = await import('@/lib/cache')
  const nextCache = await import('next/cache')
  const write = await import('@/lib/branding-write')
  const slugs = await import('@/lib/tenant-revalidation')
  return {
    ...slugs,
    writeBrandingWithClient: jest.mocked(branding.writeBrandingWithClient),
    invalidateTenantCache: jest.mocked(cache.invalidateTenantCache),
    revalidatePath: jest.mocked(nextCache.revalidatePath),
    ...write,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('saveBrandingWithClient', () => {
  it('writes with the injected client and purges the slug that client reads for the tenant', async () => {
    const m = await load()
    m.writeBrandingWithClient.mockResolvedValue({ success: true })
    const client = clientWithSlug('acme')

    await expect(m.saveBrandingWithClient(client, 'tenant-1', { header_color: '#000000' })).resolves.toEqual({ success: true })

    expect(m.writeBrandingWithClient).toHaveBeenCalledWith(client, 'tenant-1', { header_color: '#000000' })
    expect(m.invalidateTenantCache).toHaveBeenCalledWith('acme', 'tenant-1')
    expect(m.revalidatePath).toHaveBeenCalledWith('/acme/menu', 'layout')
  })

  it('does not purge anything after a refused write', async () => {
    const m = await load()
    m.writeBrandingWithClient.mockResolvedValue({ success: false, error: 'bad' })

    await m.saveBrandingWithClient(clientWithSlug('acme'), 'tenant-1', {})

    expect(m.revalidatePath).not.toHaveBeenCalled()
    expect(m.invalidateTenantCache).not.toHaveBeenCalled()
  })
})

describe('readTenantSlugById', () => {
  it('returns the stored slug', async () => {
    const m = await load()
    await expect(m.readTenantSlugById(clientWithSlug('acme'), 't')).resolves.toBe('acme')
  })

  it.each(['[tenant]', '', 'a/b', '../x', 'with space', 42])(
    'refuses a slug that would widen a route purge (%j)',
    async (slug) => {
      const m = await load()
      await expect(m.readTenantSlugById(clientWithSlug(slug), 't')).resolves.toBeNull()
    },
  )

  it('returns null for an unknown tenant', async () => {
    const m = await load()
    await expect(m.readTenantSlugById(clientWithSlug(undefined), 't')).resolves.toBeNull()
  })
})
