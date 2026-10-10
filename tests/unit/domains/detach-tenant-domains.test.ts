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
  it('detaches exactly the names the store created on the project', async () => {
    const client = fakeClient()

    await detachTenantDomains({ domain_vercel_names: ['bella.com', 'www.bella.com', 'order.bella.com'] }, client)

    expect(client.removeDomain.mock.calls.map(([name]) => name).sort()).toEqual(
      ['bella.com', 'order.bella.com', 'www.bella.com'].sort(),
    )
  })

  it('never detaches a held domain the store only adopted', async () => {
    const client = fakeClient()

    await detachTenantDomains(
      { domain: 'www.webnegosyo.net', pending_domain: 'shop.example.com', domain_vercel_names: [] },
      client,
    )

    expect(client.removeDomain).not.toHaveBeenCalled()
  })

  it('does nothing for a store without domains or without Vercel configured', async () => {
    const client = fakeClient()

    await detachTenantDomains({ domain_vercel_names: [] }, client)
    await detachTenantDomains({ domain_vercel_names: ['bella.com'] }, null)

    expect(client.removeDomain).not.toHaveBeenCalled()
  })

  it('never throws when Vercel refuses', async () => {
    const client = fakeClient({ ok: false })
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

    await expect(detachTenantDomains({ domain_vercel_names: ['bella.com'] }, client)).resolves.toBeUndefined()
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
