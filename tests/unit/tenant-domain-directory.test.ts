/**
 * @jest-environment node
 */
/**
 * Custom-domain resolution used to be one or two `tenants WHERE domain = $host`
 * queries per host per edge isolate, each with its own positive, negative and
 * error cache. During the 2026-09-20/21 Supabase stall that query was the
 * single largest statement-timeout victim, and the middleware sat behind it on
 * every request. The directory replaces all of that with ONE small read of
 * every active custom domain, shared by every host, served stale while the
 * database is unwell.
 */
import { createDomainDirectory, type DomainRow } from '@/lib/tenant-domains'

type Outcome = DomainRow[] | Error

function makeLoader(outcomes: Outcome[]) {
  const calls: number[] = []
  const loader = async () => {
    calls.push(Date.now())
    const next = outcomes.length > 1 ? outcomes.shift()! : outcomes[0]
    if (next instanceof Error) throw next
    return next
  }
  return { loader, calls }
}

const ROWS: DomainRow[] = [
  { slug: 'ligna', domain: 'ligna.cafe' },
  { slug: 'alola', domain: 'www.alolascoop.com' },
  { slug: 'gray', domain: 'https://The-Gray-Co.com/' },
  { slug: 'broken', domain: 'nodots' },
  { slug: 'empty', domain: null },
]

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-09-21T00:00:00Z') })
})

afterEach(() => {
  jest.useRealTimers()
})

describe('createDomainDirectory', () => {
  it('answers every host from one load', async () => {
    const { loader, calls } = makeLoader([ROWS])
    const directory = createDomainDirectory(loader)

    await expect(directory.lookup('ligna.cafe')).resolves.toBe('ligna')
    await expect(directory.lookup('alolascoop.com')).resolves.toBe('alola')
    await expect(directory.lookup('the-gray-co.com')).resolves.toBe('gray')
    await expect(directory.lookup('unknown.example')).resolves.toBeNull()

    expect(calls).toHaveLength(1)
  })

  it('collapses www, case and port on both the stored domain and the host', async () => {
    const { loader } = makeLoader([ROWS])
    const directory = createDomainDirectory(loader)

    await expect(directory.lookup('WWW.Ligna.Cafe')).resolves.toBe('ligna')
    await expect(directory.lookup('www.alolascoop.com:443')).resolves.toBe('alola')
    await expect(directory.lookup('alolascoop.com')).resolves.toBe('alola')
  })

  it('skips rows whose domain cannot be normalised', async () => {
    const { loader } = makeLoader([ROWS])
    const directory = createDomainDirectory(loader)

    await expect(directory.lookup('nodots')).resolves.toBeNull()
  })

  it('reloads once the directory is older than the ttl', async () => {
    const { loader, calls } = makeLoader([ROWS])
    const directory = createDomainDirectory(loader, { ttlMs: 1000, retryMs: 100 })

    await directory.lookup('ligna.cafe')
    jest.advanceTimersByTime(999)
    await directory.lookup('ligna.cafe')
    expect(calls).toHaveLength(1)

    jest.advanceTimersByTime(2)
    await directory.lookup('ligna.cafe')
    expect(calls).toHaveLength(2)
  })

  it('keeps serving the stale directory when a reload fails', async () => {
    const { loader, calls } = makeLoader([ROWS, new Error('statement timeout')])
    const directory = createDomainDirectory(loader, { ttlMs: 1000, retryMs: 100 })

    await directory.lookup('ligna.cafe')
    jest.advanceTimersByTime(1001)

    await expect(directory.lookup('ligna.cafe')).resolves.toBe('ligna')
    expect(calls).toHaveLength(2)
  })

  it('does not retry a failed reload until retryMs has passed', async () => {
    const { loader, calls } = makeLoader([new Error('down')])
    const directory = createDomainDirectory(loader, { ttlMs: 1000, retryMs: 100 })

    await expect(directory.lookup('ligna.cafe')).resolves.toBeNull()
    await directory.lookup('ligna.cafe')
    jest.advanceTimersByTime(99)
    await directory.lookup('ligna.cafe')
    expect(calls).toHaveLength(1)

    jest.advanceTimersByTime(2)
    await directory.lookup('ligna.cafe')
    expect(calls).toHaveLength(2)
  })

  it('shares one in-flight load between concurrent lookups', async () => {
    let release: (rows: DomainRow[]) => void = () => {}
    const calls: number[] = []
    const loader = () =>
      new Promise<DomainRow[]>((resolve) => {
        calls.push(1)
        release = resolve
      })
    const directory = createDomainDirectory(loader)

    const pending = Promise.all([directory.lookup('ligna.cafe'), directory.lookup('alolascoop.com')])
    release(ROWS)

    await expect(pending).resolves.toEqual(['ligna', 'alola'])
    expect(calls).toHaveLength(1)
  })

  it('invalidate() makes the next lookup reload', async () => {
    const { loader, calls } = makeLoader([ROWS])
    const directory = createDomainDirectory(loader)

    await directory.lookup('ligna.cafe')
    directory.invalidate()
    await directory.lookup('ligna.cafe')

    expect(calls).toHaveLength(2)
  })

  it('returns null for a host that is not a domain at all', async () => {
    const { loader, calls } = makeLoader([ROWS])
    const directory = createDomainDirectory(loader)

    await expect(directory.lookup('')).resolves.toBeNull()
    await expect(directory.lookup('localhost')).resolves.toBeNull()
    expect(calls).toHaveLength(0)
  })
})

describe('custom-domain collisions', () => {
  it('maps a domain claimed by two tenants to nobody, in either row order', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})
    const rows: DomainRow[] = [
      { slug: 'owner', domain: 'shared.cafe' },
      { slug: 'squatter', domain: 'www.Shared.cafe' },
      { slug: 'ligna', domain: 'ligna.cafe' },
    ]

    for (const order of [rows, [...rows].reverse()]) {
      const directory = createDomainDirectory(makeLoader([order]).loader)
      await expect(directory.lookup('shared.cafe')).resolves.toBeNull()
      await expect(directory.lookup('www.shared.cafe')).resolves.toBeNull()
      await expect(directory.lookup('ligna.cafe')).resolves.toBe('ligna')
    }

    expect(error).toHaveBeenCalled()
    expect(JSON.stringify(error.mock.calls)).toContain('shared.cafe')
    error.mockRestore()
  })

  it('is not a collision when the same tenant appears twice', async () => {
    const directory = createDomainDirectory(
      makeLoader([[{ slug: 'ligna', domain: 'ligna.cafe' }, { slug: 'ligna', domain: 'www.ligna.cafe' }]]).loader,
    )
    await expect(directory.lookup('ligna.cafe')).resolves.toBe('ligna')
  })
})
