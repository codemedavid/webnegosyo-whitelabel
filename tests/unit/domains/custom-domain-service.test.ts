import {
  createCustomDomainService,
  type DomainPatch,
  type DomainStore,
  type TenantDomainRow,
} from '@/lib/domains/custom-domain-service'
import type { VercelDomainsClient, VercelResult } from '@/lib/domains/vercel-domains'
import type { TxtLookup } from '@/lib/domains/txt-lookup'
import { PENDING_CLAIM_TTL_MS } from '@/lib/domains/domain-plan'

const NOW = new Date('2026-09-29T08:00:00Z').getTime()
const NOW_ISO = new Date(NOW).toISOString()
const TOKEN = 'tok123'
const PROOF = `webnegosyo-verification=${TOKEN}`

function row(overrides: Partial<TenantDomainRow> = {}): TenantDomainRow {
  return {
    id: 't1',
    slug: 'bella',
    domain: null,
    pendingDomain: null,
    pendingToken: null,
    pendingClaimedAt: null,
    domainVerifiedAt: null,
    vercelNames: [],
    ...overrides,
  }
}

function pendingRow(domain: string, overrides: Partial<TenantDomainRow> = {}): TenantDomainRow {
  return row({ pendingDomain: domain, pendingToken: TOKEN, pendingClaimedAt: NOW_ISO, ...overrides })
}

function fakeStore(tenants: TenantDomainRow[], options: { conflictOnUpdate?: boolean } = {}) {
  let rows = tenants.map((t) => ({ ...t }))
  const updates: Array<{ id: string; patch: DomainPatch }> = []
  const store: DomainStore = {
    async getTenant(id) {
      return rows.find((r) => r.id === id) ?? null
    },
    async findHolder(domain, excludeId) {
      return rows.find((r) => r.id !== excludeId && (r.domain === domain || r.pendingDomain === domain)) ?? null
    },
    async update(id, patch) {
      updates.push({ id, patch })
      if (options.conflictOnUpdate) return { ok: false, isConflict: true, message: 'duplicate key' }
      rows = rows.map((r) => (r.id === id ? { ...r, ...patch } : r))
      return { ok: true }
    },
  }
  return { store, updates, rows: () => rows }
}

const ok = <T,>(data: T): VercelResult<T> => ({ ok: true, data })
const fail = (status: number, code: string, message = code): VercelResult<never> => ({
  ok: false,
  status,
  code,
  message,
})

function apexOf(name: string): string {
  return name.split('.').slice(-2).join('.')
}

const MISCONFIGURED = ok({ misconfigured: true, recommendedIPv4: '216.198.79.1', recommendedCNAME: 'x.vercel-dns-017.com' })
const CONFIGURED = ok({ misconfigured: false, recommendedIPv4: null, recommendedCNAME: null })

function fakeVercel(overrides: Partial<VercelDomainsClient> = {}) {
  const domain = (name: string) => ok({ name, apexName: apexOf(name), verified: true, verification: [] })
  return {
    addDomain: jest.fn(async (name: string) => domain(name)),
    getDomain: jest.fn(async (name: string) => domain(name)),
    verifyDomain: jest.fn(async (name: string) => domain(name)),
    removeDomain: jest.fn(async () => ok(null)),
    getConfig: jest.fn(async () => MISCONFIGURED),
    ...overrides,
  } as jest.Mocked<VercelDomainsClient>
}

const noTxt: TxtLookup = async () => ({ ok: true, values: [] })
const withProof: TxtLookup = async () => ({ ok: true, values: ['unrelated', PROOF] })

function service(store: DomainStore, vercel: VercelDomainsClient, lookupTxt: TxtLookup = noTxt) {
  return createCustomDomainService({
    store,
    vercel,
    lookupTxt,
    now: () => NOW,
    createToken: () => TOKEN,
    rootDomain: 'webnegosyo.com',
  })
}

describe('connect', () => {
  it('claims a subdomain as pending without routing it, and lists the records to add', async () => {
    const { store, rows } = fakeStore([row()])
    const vercel = fakeVercel()

    const result = await service(store, vercel).connect('t1', 'Order.Bella.com')

    expect(vercel.addDomain).toHaveBeenCalledTimes(1)
    expect(vercel.addDomain).toHaveBeenCalledWith('order.bella.com')
    expect(rows()[0]).toMatchObject({
      domain: null,
      pendingDomain: 'order.bella.com',
      pendingToken: TOKEN,
      pendingClaimedAt: NOW_ISO,
    })
    expect(result).toEqual({
      ok: true,
      isRoutingChanged: false,
      view: {
        domain: 'order.bella.com',
        status: 'pending',
        isDnsReady: false,
        verifiedAt: null,
        records: [
          { type: 'CNAME', host: 'order', value: 'x.vercel-dns-017.com', purpose: 'routing' },
          { type: 'TXT', host: '_webnegosyo.order', value: PROOF, purpose: 'ownership' },
        ],
      },
    })
  })

  it('also attaches www as a redirect for an apex domain', async () => {
    const { store } = fakeStore([row()])
    const vercel = fakeVercel()

    await service(store, vercel).connect('t1', 'www.bella.com')

    expect(vercel.addDomain).toHaveBeenNthCalledWith(1, 'bella.com')
    expect(vercel.addDomain).toHaveBeenNthCalledWith(2, 'www.bella.com', 'bella.com')
  })

  it('does NOT route a domain whose DNS already points here until this store proves ownership', async () => {
    const { store, rows } = fakeStore([row()])
    const vercel = fakeVercel({ getConfig: jest.fn(async () => CONFIGURED) })

    const result = await service(store, vercel, noTxt).connect('t1', 'bella.com')

    expect(result.ok && result.view.status).toBe('pending')
    expect(rows()[0].domain).toBeNull()
  })

  it('goes live once the ownership TXT is published and Vercel has verified', async () => {
    const { store, rows } = fakeStore([row()])
    const vercel = fakeVercel({ getConfig: jest.fn(async () => CONFIGURED) })
    const lookupTxt = jest.fn(withProof)

    const result = await service(store, vercel, lookupTxt).connect('t1', 'order.bella.com')

    expect(lookupTxt).toHaveBeenCalledWith('_webnegosyo.order.bella.com')
    expect(rows()[0]).toMatchObject({
      domain: 'order.bella.com',
      pendingDomain: null,
      pendingToken: null,
      pendingClaimedAt: null,
      domainVerifiedAt: NOW_ISO,
    })
    expect(result).toMatchObject({ ok: true, isRoutingChanged: true, view: { status: 'active', isDnsReady: true } })
  })

  it('waits for Vercel verification even when the TXT proof is present', async () => {
    const { store, rows } = fakeStore([row()])
    const unverified = (name: string) =>
      ok({ name, apexName: apexOf(name), verified: false, verification: [] })
    const vercel = fakeVercel({
      getDomain: jest.fn(async (name: string) => unverified(name)),
      verifyDomain: jest.fn(async () => fail(400, 'missing_txt_record')),
    })

    const result = await service(store, vercel, withProof).connect('t1', 'order.bella.com')

    expect(result.ok && result.view.status).toBe('pending')
    expect(rows()[0].domain).toBeNull()
  })

  it('refuses to start a new domain while one is connected or pending', async () => {
    for (const existing of [row({ domain: 'old.com' }), pendingRow('old.com')]) {
      const { store, updates } = fakeStore([existing])
      const vercel = fakeVercel()

      const result = await service(store, vercel).connect('t1', 'new.com')

      expect(result).toEqual({ ok: false, error: expect.stringMatching(/remove old\.com first/i) })
      expect(vercel.addDomain).not.toHaveBeenCalled()
      expect(updates).toHaveLength(0)
    }
  })

  it('re-checks instead of re-claiming a domain this store already has pending', async () => {
    const { store, updates } = fakeStore([pendingRow('bella.com')])
    const vercel = fakeVercel()

    const result = await service(store, vercel).connect('t1', 'bella.com')

    expect(result.ok).toBe(true)
    expect(vercel.addDomain).not.toHaveBeenCalled()
    expect(updates).toHaveLength(0)
  })

  it('refuses a domain another store is serving', async () => {
    const { store } = fakeStore([row(), row({ id: 't2', domain: 'bella.com' })])
    const vercel = fakeVercel()

    const result = await service(store, vercel).connect('t1', 'bella.com')

    expect(result).toEqual({ ok: false, error: expect.stringMatching(/another store/i) })
    expect(vercel.addDomain).not.toHaveBeenCalled()
  })

  it('refuses a domain another store claimed recently', async () => {
    const { store } = fakeStore([row(), pendingRow('bella.com', { id: 't2' })])

    const result = await service(store, fakeVercel()).connect('t1', 'bella.com')

    expect(result).toEqual({ ok: false, error: expect.stringMatching(/another store/i) })
  })

  it('takes over a claim left unproven past the TTL', async () => {
    const stale = new Date(NOW - PENDING_CLAIM_TTL_MS - 1000).toISOString()
    const { store, rows } = fakeStore([row(), pendingRow('bella.com', { id: 't2', pendingClaimedAt: stale })])

    const result = await service(store, fakeVercel()).connect('t1', 'bella.com')

    expect(result.ok).toBe(true)
    expect(rows().find((r) => r.id === 't2')).toMatchObject({ pendingDomain: null, pendingToken: null })
    expect(rows().find((r) => r.id === 't1')).toMatchObject({ pendingDomain: 'bella.com' })
  })

  it('takes over the Vercel names a released stale claim created', async () => {
    const stale = new Date(NOW - PENDING_CLAIM_TTL_MS - 1000).toISOString()
    const { store, rows } = fakeStore([
      row(),
      pendingRow('bella.com', { id: 't2', pendingClaimedAt: stale, vercelNames: ['bella.com', 'www.bella.com'] }),
    ])
    // Still on the project from t2's claim, so t1 adopts rather than creates.
    const vercel = fakeVercel({ addDomain: jest.fn(async () => fail(400, 'domain_already_exists')) })

    await service(store, vercel).connect('t1', 'bella.com')

    expect(rows().find((r) => r.id === 't2')?.vercelNames).toEqual([])
    expect(rows().find((r) => r.id === 't1')?.vercelNames).toEqual(['bella.com', 'www.bella.com'])
  })

  it('explains a domain held by another Vercel account and claims nothing', async () => {
    const { store, updates } = fakeStore([row()])
    const vercel = fakeVercel({
      addDomain: jest.fn(async () => fail(409, 'domain_already_in_use')),
      getDomain: jest.fn(async () => fail(404, 'not_found')),
    })

    const result = await service(store, vercel).connect('t1', 'bella.com')

    expect(result).toEqual({ ok: false, error: expect.stringMatching(/another Vercel/i) })
    expect(updates).toHaveLength(0)
  })

  it('adopts a domain that is already on the project without taking ownership of it', async () => {
    const { store, rows } = fakeStore([row()])
    const vercel = fakeVercel({ addDomain: jest.fn(async () => fail(400, 'domain_already_exists')) })

    expect((await service(store, vercel).connect('t1', 'order.bella.com')).ok).toBe(true)
    expect(rows()[0].vercelNames).toEqual([])
  })

  it('records the names it created on the project (apex and www alias)', async () => {
    const { store, rows } = fakeStore([row()])

    await service(store, fakeVercel()).connect('t1', 'bella.com')

    expect(rows()[0].vercelNames).toEqual(['bella.com', 'www.bella.com'])
  })

  it('does not own a www alias that was already on the project', async () => {
    const { store, rows } = fakeStore([row()])
    const vercel = fakeVercel({
      addDomain: jest.fn(async (name: string) =>
        name.startsWith('www.')
          ? fail(400, 'domain_already_exists')
          : ok({ name, apexName: name, verified: true, verification: [] }),
      ),
    })

    await service(store, vercel).connect('t1', 'bella.com')

    expect(rows()[0].vercelNames).toEqual(['bella.com'])
  })

  it('an adopted domain survives connect then disconnect', async () => {
    const { store } = fakeStore([row()])
    const vercel = fakeVercel({ addDomain: jest.fn(async () => fail(400, 'domain_already_exists')) })
    const domains = service(store, vercel)

    await domains.connect('t1', 'shop.example.com')
    await domains.disconnect('t1')

    expect(vercel.removeDomain).not.toHaveBeenCalled()
  })

  it('reports a lost race on the unique index as taken', async () => {
    const { store } = fakeStore([row()], { conflictOnUpdate: true })

    const result = await service(store, fakeVercel()).connect('t1', 'bella.com')

    expect(result).toEqual({ ok: false, error: expect.stringMatching(/another store/i) })
  })

  it('rejects invalid input before touching Vercel', async () => {
    const { store } = fakeStore([row()])
    const vercel = fakeVercel()

    expect((await service(store, vercel).connect('t1', 'shop.webnegosyo.com')).ok).toBe(false)
    expect(vercel.addDomain).not.toHaveBeenCalled()
  })
})

describe('check', () => {
  it('returns an empty view when the store has no domain', async () => {
    const { store } = fakeStore([row()])

    expect(await service(store, fakeVercel()).check('t1')).toEqual({
      ok: true,
      isRoutingChanged: false,
      view: { domain: null, status: null, isDnsReady: false, verifiedAt: null, records: [] },
    })
  })

  it('reports a connected domain whose DNS is not pointing here yet', async () => {
    const { store, updates } = fakeStore([row({ domain: 'order.bella.com', domainVerifiedAt: NOW_ISO })])

    const result = await service(store, fakeVercel()).check('t1')

    expect(result).toMatchObject({ ok: true, view: { status: 'active', isDnsReady: false } })
    expect(result.ok && result.view.records.map((r) => r.purpose)).toEqual(['routing'])
    expect(updates).toHaveLength(0)
  })

  it('keeps a legacy hand-configured domain live and attaches it to the project', async () => {
    const { store, rows } = fakeStore([row({ domain: 'bella.com' })])
    const vercel = fakeVercel({
      getDomain: jest.fn(async () => fail(404, 'not_found')),
      getConfig: jest.fn(async () => CONFIGURED),
    })

    const result = await service(store, vercel).check('t1')

    expect(vercel.addDomain).toHaveBeenCalledWith('bella.com')
    expect(result).toMatchObject({ ok: true, view: { status: 'active', isDnsReady: true } })
    expect(rows()[0].domain).toBe('bella.com')
    expect(rows()[0].vercelNames).toEqual(['bella.com', 'www.bella.com'])
  })

  it('lists the Vercel TXT challenge for a pending domain it cannot verify yet', async () => {
    const { store } = fakeStore([pendingRow('order.bella.com')])
    const challenge = { type: 'TXT', domain: '_vercel.bella.com', value: 'vc-domain-verify=abc', reason: 'pending' }
    const vercel = fakeVercel({
      getDomain: jest.fn(async () =>
        ok({ name: 'order.bella.com', apexName: 'bella.com', verified: false, verification: [challenge] }),
      ),
      verifyDomain: jest.fn(async () => fail(400, 'missing_txt_record')),
    })

    const result = await service(store, vercel).check('t1')

    expect(vercel.verifyDomain).toHaveBeenCalledWith('order.bella.com')
    expect(result.ok && result.view.records.map((r) => r.purpose)).toEqual(['routing', 'ownership', 'verification'])
  })

  it('stays pending when the DNS resolver cannot be reached', async () => {
    const { store, rows } = fakeStore([pendingRow('order.bella.com')])

    const result = await service(store, fakeVercel(), async () => ({ ok: false })).check('t1')

    expect(result.ok && result.view.status).toBe('pending')
    expect(rows()[0].domain).toBeNull()
  })

  it('surfaces a Vercel outage as an error', async () => {
    const { store } = fakeStore([pendingRow('bella.com')])
    const vercel = fakeVercel({ getDomain: jest.fn(async () => fail(0, 'network_error', 'timeout')) })

    expect(await service(store, vercel).check('t1')).toEqual({ ok: false, error: expect.stringMatching(/try again/i) })
  })

  it('reports another store already serving the domain at promotion time', async () => {
    const { store } = fakeStore([pendingRow('bella.com')], { conflictOnUpdate: true })
    const vercel = fakeVercel({ getConfig: jest.fn(async () => CONFIGURED) })

    const result = await service(store, vercel, withProof).check('t1')

    expect(result).toEqual({ ok: false, error: expect.stringMatching(/another store/i) })
  })
})

describe('disconnect', () => {
  it('stops routing the domain and detaches it and its www alias', async () => {
    const { store, rows } = fakeStore([
      row({ domain: 'bella.com', domainVerifiedAt: NOW_ISO, vercelNames: ['bella.com', 'www.bella.com'] }),
    ])
    const vercel = fakeVercel()

    const result = await service(store, vercel).disconnect('t1')

    expect(rows()[0]).toMatchObject({ domain: null, pendingDomain: null, domainVerifiedAt: null })
    expect(vercel.removeDomain).toHaveBeenCalledWith('www.bella.com')
    expect(vercel.removeDomain).toHaveBeenCalledWith('bella.com')
    expect(result).toEqual({
      ok: true,
      isRoutingChanged: true,
      view: { domain: null, status: null, isDnsReady: false, verifiedAt: null, records: [] },
    })
  })

  it('cancels a pending claim without touching routing', async () => {
    const { store, rows } = fakeStore([pendingRow('order.bella.com', { vercelNames: ['order.bella.com'] })])
    const vercel = fakeVercel()

    const result = await service(store, vercel).disconnect('t1')

    expect(rows()[0]).toMatchObject({ pendingDomain: null, pendingToken: null, pendingClaimedAt: null })
    expect(vercel.removeDomain).toHaveBeenCalledWith('order.bella.com')
    expect(result.ok && result.isRoutingChanged).toBe(false)
  })

  it('still frees the store when Vercel cannot detach', async () => {
    const { store, rows } = fakeStore([row({ domain: 'bella.com', vercelNames: ['bella.com', 'www.bella.com'] })])
    const vercel = fakeVercel({ removeDomain: jest.fn(async () => fail(500, 'internal')) })

    expect((await service(store, vercel).disconnect('t1')).ok).toBe(true)
    expect(rows()[0].domain).toBeNull()
    // Kept, so the next disconnect retries them.
    expect(rows()[0].vercelNames).toEqual(['bella.com', 'www.bella.com'])
  })

  it('leaves a domain it adopted (never created) on the shared project', async () => {
    const { store, rows } = fakeStore([row({ domain: 'www.webnegosyo.net', vercelNames: [] })])
    const vercel = fakeVercel()

    expect((await service(store, vercel).disconnect('t1')).ok).toBe(true)

    expect(rows()[0].domain).toBeNull()
    expect(vercel.removeDomain).not.toHaveBeenCalled()
  })

  it('never detaches a name another store holds', async () => {
    const { store } = fakeStore([
      row({ domain: 'bella.com', vercelNames: ['bella.com', 'www.bella.com'] }),
      row({ id: 't2', domain: 'www.bella.com' }),
    ])
    const vercel = fakeVercel()

    await service(store, vercel).disconnect('t1')

    expect(vercel.removeDomain.mock.calls.map(([name]) => name)).toEqual(['bella.com'])
  })

  it('retries names left over from an earlier failed detach', async () => {
    const { store, rows } = fakeStore([row({ vercelNames: ['bella.com'] })])
    const vercel = fakeVercel()

    await service(store, vercel).disconnect('t1')

    expect(vercel.removeDomain).toHaveBeenCalledWith('bella.com')
    expect(rows()[0].vercelNames).toEqual([])
  })
})
