import { lookup } from 'node:dns'
import { publicOnlyLookup } from '@/lib/loyalty/wallet-pass/pass-images'

jest.mock('server-only', () => ({}))
jest.mock('sharp', () => jest.fn())
jest.mock('node:dns', () => ({ lookup: jest.fn() }))

type Entry = { address: string; family: number }

function resolvesTo(entries: Entry[]) {
  jest.mocked(lookup).mockImplementation(((_host: string, _opts: unknown, cb: (e: Error | null, a: Entry[]) => void) =>
    cb(null, entries)) as never)
}

function run(all: boolean): Promise<{ error: Error | null; address: unknown; family?: number }> {
  return new Promise((resolve) => {
    publicOnlyLookup('logo.example.com', { all }, (error, address, family) => resolve({ error, address, family }))
  })
}

describe('publicOnlyLookup (DNS-rebinding guard for merchant logo URLs)', () => {
  test('a public address connects', async () => {
    resolvesTo([{ address: '93.184.216.34', family: 4 }])
    await expect(run(false)).resolves.toEqual({ error: null, address: '93.184.216.34', family: 4 })
  })

  test.each([
    ['cloud metadata', '169.254.169.254', 4],
    ['loopback', '127.0.0.1', 4],
    ['private range', '10.1.2.3', 4],
    ['ipv6 loopback', '::1', 6],
  ])('a name that resolves to %s is refused at connect time', async (_label, address, family) => {
    resolvesTo([{ address, family }])
    const result = await run(false)
    expect(result.error).toBeInstanceOf(Error)
  })

  test('one private address among several refuses the whole lookup', async () => {
    resolvesTo([{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }])
    expect((await run(true)).error).toBeInstanceOf(Error)
  })

  test('supports the all:true form Node uses for happy-eyeballs', async () => {
    resolvesTo([{ address: '93.184.216.34', family: 4 }])
    await expect(run(true)).resolves.toEqual({ error: null, address: [{ address: '93.184.216.34', family: 4 }], family: undefined })
  })
})
