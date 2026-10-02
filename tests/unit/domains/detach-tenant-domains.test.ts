import { detachTenantDomains } from '@/lib/domains/detach-tenant-domains'
import type { VercelDomainsClient } from '@/lib/domains/vercel-domains'

function fakeClient(removeResult: { ok: boolean } = { ok: true }) {
  return {
    addDomain: jest.fn(),
    getDomain: jest.fn(),
    verifyDomain: jest.fn(),
    getConfig: jest.fn(),
    removeDomain: jest.fn(async () =>
      removeResult.ok ? { ok: true, data: null } : { ok: false, status: 500, code: 'internal', message: 'x' },
    ),
  } as unknown as jest.Mocked<VercelDomainsClient>
}

describe('detachTenantDomains', () => {
  it('detaches the routed and pending domains with their www aliases', async () => {
    const client = fakeClient()

    await detachTenantDomains({ domain: 'bella.com', pending_domain: 'order.bella.com' }, client)

    expect(client.removeDomain.mock.calls.map(([name]) => name).sort()).toEqual(
      ['bella.com', 'order.bella.com', 'www.bella.com', 'www.order.bella.com'].sort(),
    )
  })

  it('does nothing for a store without domains or without Vercel configured', async () => {
    const client = fakeClient()

    await detachTenantDomains({ domain: null, pending_domain: null }, client)
    await detachTenantDomains({ domain: 'bella.com' }, null)

    expect(client.removeDomain).not.toHaveBeenCalled()
  })

  it('never throws when Vercel refuses', async () => {
    const client = fakeClient({ ok: false })
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

    await expect(detachTenantDomains({ domain: 'bella.com' }, client)).resolves.toBeUndefined()
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
