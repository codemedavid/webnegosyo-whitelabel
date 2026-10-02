import { createVercelDomainsClient, readVercelDomainsConfig } from '@/lib/domains/vercel-domains'

const CONFIG = { token: 'tok', projectId: 'prj_1', teamId: 'team_1' }

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

describe('readVercelDomainsConfig', () => {
  it('is null until both the token and the project are set', () => {
    expect(readVercelDomainsConfig({})).toBeNull()
    expect(readVercelDomainsConfig({ VERCEL_API_TOKEN: 'tok' })).toBeNull()
  })

  it('reads token, project and optional team', () => {
    expect(
      readVercelDomainsConfig({ VERCEL_API_TOKEN: 'tok', VERCEL_PROJECT_ID: 'prj_1', VERCEL_TEAM_ID: 'team_1' }),
    ).toEqual(CONFIG)
    expect(readVercelDomainsConfig({ VERCEL_API_TOKEN: 'tok', VERCEL_PROJECT_ID: 'prj_1' })).toEqual({
      ...CONFIG,
      teamId: null,
    })
  })
})

describe('createVercelDomainsClient', () => {
  it('adds a domain to the project with auth and team scope', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse(200, { name: 'bella.com', apexName: 'bella.com', verified: true }),
    )
    const client = createVercelDomainsClient(CONFIG, fetchImpl)

    const result = await client.addDomain('bella.com')

    expect(result).toEqual({
      ok: true,
      data: { name: 'bella.com', apexName: 'bella.com', verified: true, verification: [] },
    })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.vercel.com/v10/projects/prj_1/domains?teamId=team_1')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer tok')
    expect(JSON.parse(init.body)).toEqual({ name: 'bella.com' })
  })

  it('sends a permanent redirect for a www alias', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse(200, { name: 'www.bella.com', apexName: 'bella.com', verified: true }),
    )
    const client = createVercelDomainsClient(CONFIG, fetchImpl)

    await client.addDomain('www.bella.com', 'bella.com')

    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      name: 'www.bella.com',
      redirect: 'bella.com',
      redirectStatusCode: 308,
    })
  })

  it('returns Vercel error code and message on failure', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse(409, { error: { code: 'domain_already_in_use', message: 'in use by another project' } }),
    )
    const client = createVercelDomainsClient(CONFIG, fetchImpl)

    expect(await client.addDomain('bella.com')).toEqual({
      ok: false,
      status: 409,
      code: 'domain_already_in_use',
      message: 'in use by another project',
    })
  })

  it('turns a network failure into a result instead of throwing', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('socket hang up'))
    const client = createVercelDomainsClient(CONFIG, fetchImpl)

    expect(await client.getDomain('bella.com')).toEqual({
      ok: false,
      status: 0,
      code: 'network_error',
      message: 'socket hang up',
    })
  })

  it('reads the rank-1 DNS recommendations from the domain config', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        misconfigured: true,
        recommendedIPv4: [
          { rank: 2, value: ['76.76.21.21'] },
          { rank: 1, value: ['216.198.79.1', '216.198.79.65'] },
        ],
        recommendedCNAME: [{ rank: 1, value: 'abc.vercel-dns-017.com.' }],
      }),
    )
    const client = createVercelDomainsClient(CONFIG, fetchImpl)

    const result = await client.getConfig('bella.com')

    expect(result).toEqual({
      ok: true,
      data: { misconfigured: true, recommendedIPv4: '216.198.79.1', recommendedCNAME: 'abc.vercel-dns-017.com' },
    })
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://api.vercel.com/v6/domains/bella.com/config?teamId=team_1&projectIdOrName=prj_1',
    )
  })

  it('treats removing an already-absent domain as success', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(404, { error: { code: 'not_found', message: 'nope' } }))
    const client = createVercelDomainsClient(CONFIG, fetchImpl)

    expect(await client.removeDomain('bella.com')).toEqual({ ok: true, data: null })
    expect(fetchImpl.mock.calls[0][1].method).toBe('DELETE')
  })

  it('url-encodes the domain in paths', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, { name: 'a.com', apexName: 'a.com', verified: true }))
    const client = createVercelDomainsClient({ ...CONFIG, teamId: null }, fetchImpl)

    await client.verifyDomain('a.com/../x')

    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.vercel.com/v9/projects/prj_1/domains/a.com%2F..%2Fx/verify')
  })
})
