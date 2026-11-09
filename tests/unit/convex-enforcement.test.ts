/** @jest-environment node */
import {
  MIN_ENFORCEABLE_SCHEMA_VERSION,
  classifyProbeResponse,
  parseEnforcementArgs,
  parseTenantList,
  planEnforce,
  probeAnonymously,
  redactSecrets,
  rollbackStore,
  enforceStore,
  selectStores,
  verifyEnforced,
  type EnforceTarget,
  type EnforcementDeps,
  type ProbeResult,
} from '@/lib/convex-enforcement'

describe('classifyProbeResponse', () => {
  it('reads an answer as open, whatever it holds', () => {
    expect(classifyProbeResponse(200, { status: 'success', value: [{ customerName: 'Ana' }] })).toBe('open')
    expect(classifyProbeResponse(200, { status: 'success', value: [] })).toBe('open')
  })

  it('reads the gate by its reason, from data or from the message', () => {
    expect(classifyProbeResponse(560, { status: 'error', errorMessage: 'x', errorData: 'Unauthorized: unauthenticated' })).toBe('refused')
    expect(classifyProbeResponse(560, { status: 'error', errorMessage: 'Uncaught Error: Unauthorized: unauthenticated' })).toBe('refused')
    expect(classifyProbeResponse(200, { status: 'error', errorMessage: 'Unauthorized: unpinned' })).toBe('refused')
  })

  it('reads a bare redacted error as refused: v28-39 production hides the reason', () => {
    expect(classifyProbeResponse(560, { status: 'error', errorMessage: '[Request ID: 5f2] Server Error' })).toBe('refused')
  })

  it('does not mistake a deployment that cannot answer for a refusal', () => {
    expect(classifyProbeResponse(404, { code: 'DeploymentNotFound' })).toBe('down')
    expect(classifyProbeResponse(503, null)).toBe('down')
    expect(classifyProbeResponse(200, null)).toBe('down')
    expect(classifyProbeResponse(200, { status: 'something else' })).toBe('down')
    expect(classifyProbeResponse(400, { status: 'error', errorMessage: 'Could not find public function for orders:getOrders' })).toBe('down')
    expect(classifyProbeResponse(560, { status: 'error', errorMessage: 'Server Error\nArgumentValidationError: limit is not in the validator' })).toBe('down')
    expect(classifyProbeResponse(560, { status: 'error', errorMessage: 'Too many reads' })).toBe('down')
  })
})

describe('probeAnonymously', () => {
  it('asks for one order with no credentials and returns only the verdict', async () => {
    const fetchImpl = jest.fn(async () => new Response(JSON.stringify({ status: 'success', value: [{ customerContact: '+63917' }] }), { status: 200 }))

    await expect(probeAnonymously('https://store.convex.cloud', fetchImpl as unknown as typeof fetch)).resolves.toBe('open')

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://store.convex.cloud/api/query')
    expect(JSON.parse(String(init.body))).toEqual({ path: 'orders:getOrders', args: { limit: 1 }, format: 'json' })
    expect(new Headers(init.headers).has('authorization')).toBe(false)
  })

  it('is down when nothing answers', async () => {
    const fetchImpl = jest.fn(async () => { throw new TypeError('fetch failed') })
    await expect(probeAnonymously('https://store.convex.cloud', fetchImpl as unknown as typeof fetch)).resolves.toBe('down')
  })

  it('is down when the answer is not JSON', async () => {
    const fetchImpl = jest.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 }))
    await expect(probeAnonymously('https://store.convex.cloud', fetchImpl as unknown as typeof fetch)).resolves.toBe('down')
  })
})

const TARGET: EnforceTarget = {
  slug: 'store',
  hasDeployment: true,
  deployedVersion: '40',
  authEnforced: false,
  publicReads: false,
}

describe('planEnforce', () => {
  it('proceeds on a current store that answers today', () => {
    expect(planEnforce(TARGET, 'open')).toEqual({ proceed: true, notes: [] })
  })

  it('refuses a store with no deployment or deploy key', () => {
    expect(planEnforce({ ...TARGET, hasDeployment: false }, 'open').proceed).toBe(false)
  })

  it(`refuses a store below v${MIN_ENFORCEABLE_SCHEMA_VERSION} or with no recorded version`, () => {
    expect(planEnforce({ ...TARGET, deployedVersion: '27' }, 'open').proceed).toBe(false)
    expect(planEnforce({ ...TARGET, deployedVersion: null }, 'open').proceed).toBe(false)
    expect(planEnforce({ ...TARGET, deployedVersion: 'n/a' }, 'open').proceed).toBe(false)
    expect(planEnforce({ ...TARGET, deployedVersion: '9' }, 'open').proceed).toBe(false)
  })

  it('warns, without refusing, about a store older than the version that names its refusals', () => {
    const plan = planEnforce({ ...TARGET, deployedVersion: '28' }, 'open')
    expect(plan.proceed).toBe(true)
    expect(plan.proceed && plan.notes.join(' ')).toMatch(/v40/)
  })

  it('refuses a deployment that is down', () => {
    expect(planEnforce(TARGET, 'down').proceed).toBe(false)
  })

  it('refuses a soft store that already refuses: it may simply be broken', () => {
    expect(planEnforce(TARGET, 'refused').proceed).toBe(false)
    expect(planEnforce({ ...TARGET, authEnforced: true }, 'refused').proceed).toBe(true)
  })

  it('says the demo store stays public for reads', () => {
    const plan = planEnforce({ ...TARGET, publicReads: true }, 'open')
    expect(plan.proceed && plan.notes.join(' ')).toMatch(/public for reads/)
  })
})

describe('verifyEnforced', () => {
  it('wants a refusal', () => {
    expect(verifyEnforced('refused', false)).toBe(true)
    expect(verifyEnforced('open', false)).toBe(false)
    expect(verifyEnforced('down', false)).toBe(false)
  })

  it('expects a public-read store to keep answering anonymous reads', () => {
    expect(verifyEnforced('open', true)).toBe(true)
    expect(verifyEnforced('down', true)).toBe(false)
  })
})

function deps(overrides: { probes?: ProbeResult[]; sync?: EnforcementDeps['sync'][] } = {}) {
  const probes = [...(overrides.probes ?? ['open', 'refused'])]
  const syncs = [...(overrides.sync ?? [])]
  const flags: boolean[] = []
  const calls: string[] = []
  const value: EnforcementDeps = {
    probe: jest.fn(async () => {
      calls.push('probe')
      return probes.shift() ?? 'down'
    }),
    setFlag: jest.fn(async (next: boolean) => {
      calls.push(`flag:${next}`)
      flags.push(next)
    }),
    sync: jest.fn(async () => {
      calls.push('sync')
      const next = syncs.shift()
      return next ? next() : { status: 'synced' as const }
    }),
  }
  return { value, flags, calls }
}

describe('enforceStore and tokenless writes', () => {
  const target = { slug: 'store', hasDeployment: true, deployedVersion: '40', authEnforced: false, publicReads: false }

  it('refuses a store whose registers still write with no token', async () => {
    const d = deps({ probes: ['open'] })
    const result = await enforceStore(target, { ...d.value, tokenlessWrites: async () => 3 })

    expect(result.ok).toBe(false)
    expect(result.detail).toContain('3 tokenless writes')
  })

  it('goes ahead when --force accepts the tokenless writes', async () => {
    const d = deps({ probes: ['open', 'refused'] })
    const result = await enforceStore(target, { ...d.value, tokenlessWrites: async () => 3 }, { force: true })

    expect(result.ok).toBe(true)
  })

  it('notes that nothing was measured when the deployment has no counter', async () => {
    const d = deps({ probes: ['open', 'refused'] })
    const result = await enforceStore(target, { ...d.value, tokenlessWrites: async () => null })

    expect(result.ok).toBe(true)
    expect(result.notes.join(' ')).toContain('no tokenless-write count')
  })
})

describe('enforceStore', () => {
  it('flips the flag, syncs at once, then proves the refusal', async () => {
    const { value, calls } = deps()
    const result = await enforceStore(TARGET, value)
    expect(result.ok).toBe(true)
    expect(calls).toEqual(['probe', 'flag:true', 'sync', 'probe'])
  })

  it('changes nothing on a dry run', async () => {
    const { value, calls } = deps()
    const result = await enforceStore(TARGET, value, { dryRun: true })
    expect(result.ok).toBe(true)
    expect(result.detail).toMatch(/would enforce/)
    expect(calls).toEqual(['probe'])
  })

  it('changes nothing on a store it refuses', async () => {
    const { value, calls } = deps({ probes: ['down'] })
    const result = await enforceStore(TARGET, value)
    expect(result.ok).toBe(false)
    expect(calls).toEqual(['probe'])
  })

  it('reverts the flag when the sync fails, and says so', async () => {
    const { value, flags } = deps({
      probes: ['open', 'open'],
      sync: [async () => ({ status: 'failed', error: 'Convex rejected the config write' }), async () => ({ status: 'synced' })],
    })
    const result = await enforceStore(TARGET, value)
    expect(result.ok).toBe(false)
    expect(result.detail).toMatch(/sync failed/)
    expect(result.detail).toMatch(/reverted/)
    expect(flags).toEqual([true, false])
  })

  it('reverts when the deployment still answers after a clean sync', async () => {
    const { value, flags } = deps({ probes: ['open', 'open', 'open'] })
    const result = await enforceStore(TARGET, value)
    expect(result.ok).toBe(false)
    expect(result.detail).toMatch(/still open/)
    expect(flags).toEqual([true, false])
  })

  it('says plainly when the revert cannot reach the deployment either', async () => {
    const { value } = deps({
      probes: ['open', 'down'],
      sync: [async () => ({ status: 'failed', error: 'x' }), async () => ({ status: 'failed', error: 'y' })],
    })
    const result = await enforceStore(TARGET, value)
    expect(result.ok).toBe(false)
    expect(result.detail).toMatch(/may still be enforcing/)
  })

  it('never flips an already enforced store back on a failed re-sync', async () => {
    const { value, flags } = deps({
      probes: ['refused'],
      sync: [async () => ({ status: 'failed', error: 'x' })],
    })
    const result = await enforceStore({ ...TARGET, authEnforced: true }, value)
    expect(result.ok).toBe(false)
    expect(flags).toEqual([true])
  })

  it('reports a failure to write the flag without touching the deployment', async () => {
    const { value } = deps()
    value.setFlag = jest.fn(async () => { throw new Error('flag not saved') })
    const result = await enforceStore(TARGET, value)
    expect(result.ok).toBe(false)
    expect(value.sync).not.toHaveBeenCalled()
  })

  it('accepts a public-read store that keeps answering reads', async () => {
    const { value } = deps({ probes: ['open', 'open'] })
    const result = await enforceStore({ ...TARGET, publicReads: true }, value)
    expect(result.ok).toBe(true)
    expect(result.notes.join(' ')).toMatch(/public for reads/)
  })
})

describe('rollbackStore', () => {
  const enforcedTarget = { ...TARGET, authEnforced: true }

  it('clears the flag, syncs and proves the store is open', async () => {
    const { value, calls } = deps({ probes: ['open'] })
    await expect(rollbackStore(enforcedTarget, value)).resolves.toMatchObject({ ok: true })
    expect(calls).toEqual(['flag:false', 'sync', 'probe'])
  })

  it('fails when the sync does', async () => {
    const { value } = deps({ sync: [async () => ({ status: 'failed', error: 'x' })] })
    const result = await rollbackStore(enforcedTarget, value)
    expect(result.ok).toBe(false)
    expect(result.detail).toMatch(/still be enforcing/)
  })

  it('fails when the deployment still refuses', async () => {
    const { value } = deps({ probes: ['refused'] })
    await expect(rollbackStore(enforcedTarget, value)).resolves.toMatchObject({ ok: false })
  })

  it('changes nothing on a dry run', async () => {
    const { value, calls } = deps()
    await expect(rollbackStore(enforcedTarget, value, { dryRun: true })).resolves.toMatchObject({ ok: true })
    expect(calls).toEqual([])
  })
})

describe('parseTenantList', () => {
  it('splits, trims and drops blanks and repeats', () => {
    expect(parseTenantList('a, b,,c,a')).toEqual(['a', 'b', 'c'])
    expect(parseTenantList('')).toEqual([])
    expect(parseTenantList(null)).toEqual([])
  })
})

describe('parseEnforcementArgs', () => {
  it('reads each subcommand', () => {
    expect(parseEnforcementArgs(['status', '--all'])).toMatchObject({ command: 'status', selector: { kind: 'all' } })
    expect(parseEnforcementArgs(['status', '--backend', 'platform'])).toMatchObject({ selector: { kind: 'backend', backend: 'platform' } })
    expect(parseEnforcementArgs(['status'])).toMatchObject({ selector: { kind: 'all' } })
    expect(parseEnforcementArgs(['enforce', '--tenants', 'a,b', '--dry-run'])).toMatchObject({
      command: 'enforce',
      selector: { kind: 'tenants', slugs: ['a', 'b'] },
      dryRun: true,
    })
    expect(parseEnforcementArgs(['audit', '--tenants', 'a', '--days', '14'])).toMatchObject({ command: 'audit', days: 14 })
  })

  it('never lets a change run without a named list of stores', () => {
    expect(parseEnforcementArgs(['enforce'])).toHaveProperty('error')
    expect(parseEnforcementArgs(['enforce', '--all'])).toHaveProperty('error')
    expect(parseEnforcementArgs(['rollback', '--backend', 'platform'])).toHaveProperty('error')
    expect(parseEnforcementArgs(['enforce', '--tenants', ','])).toHaveProperty('error')
    expect(parseEnforcementArgs(['audit'])).toHaveProperty('error')
  })

  it('refuses what it does not understand', () => {
    expect(parseEnforcementArgs([])).toHaveProperty('error')
    expect(parseEnforcementArgs(['launch', '--tenants', 'a'])).toHaveProperty('error')
    expect(parseEnforcementArgs(['status', '--backend', 'mars'])).toHaveProperty('error')
    expect(parseEnforcementArgs(['audit', '--tenants', 'a', '--days', 'soon'])).toHaveProperty('error')
  })
})

describe('selectStores', () => {
  const rows = [
    { slug: 'p', order_backend: 'platform' as const, convex_deployment_url: 'https://p.convex.cloud' },
    { slug: 'c', order_backend: 'convex' as const, convex_deployment_url: 'https://c.convex.cloud' },
    { slug: 'none', order_backend: 'auto' as const, convex_deployment_url: null },
  ]

  it('keeps only stores with a deployment unless they were named', () => {
    expect(selectStores(rows, { kind: 'all' }).selected.map((row) => row.slug)).toEqual(['p', 'c'])
  })

  it('routes by the resolved backend, never by the credentials', () => {
    expect(selectStores(rows, { kind: 'backend', backend: 'platform' }).selected.map((row) => row.slug)).toEqual(['p'])
    expect(selectStores(rows, { kind: 'backend', backend: 'convex' }).selected.map((row) => row.slug)).toEqual(['c'])
  })

  it('returns named stores and reports the ones that do not exist', () => {
    const picked = selectStores(rows, { kind: 'tenants', slugs: ['c', 'none', 'ghost'] })
    expect(picked.selected.map((row) => row.slug)).toEqual(['c', 'none'])
    expect(picked.unknownSlugs).toEqual(['ghost'])
  })
})

describe('redactSecrets', () => {
  it('removes every known secret and ignores blanks', () => {
    expect(redactSecrets('failed for prod:abc|xyz using lala', ['prod:abc|xyz', 'lala', '', null, undefined])).toBe(
      'failed for [redacted] using [redacted]'
    )
  })
})
