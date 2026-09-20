/**
 * `src/app/[tenant]/layout.tsx` sets a title template of `%s | <tenant>`, so
 * any nested route that returns `X | <tenant>` renders "X | SeaCook | SeaCook".
 * Nested routes must return only their own segment ("Menu") and let the
 * parent template append the store name once.
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const mockedTenant = jest.fn()
jest.mock('@/lib/supabase/public', () => {
  const builder = { eq: () => builder, maybeSingle: () => mockedTenant() }
  return { createPublicClient: () => ({ from: () => ({ select: () => builder }) }), describePublicQueryError: (m: string) => m }
})
jest.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))

const generateMetadata = async (args: { params: Promise<{ tenant: string }> }) =>
  (await import('@/app/[tenant]/menu/layout')).generateMetadata(args)

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

describe('menu layout generateMetadata', () => {
  beforeEach(() => mockedTenant.mockReset())

  it('returns the bare segment title so the parent template appends the store name once', async () => {
    mockedTenant.mockResolvedValue({ data: { name: 'SeaCook', font_pair: null }, error: null })

    const meta = await generateMetadata({ params: Promise.resolve({ tenant: 'seacook' }) })

    expect(meta.title).toBe('Menu')
    expect(meta.description).toContain('SeaCook')
  })

  it('still returns the bare segment title when the tenant lookup throws', async () => {
    mockedTenant.mockRejectedValue(new Error('db down'))

    const meta = await generateMetadata({ params: Promise.resolve({ tenant: 'seacook' }) })

    expect(meta.title).toBe('Menu')
  })
})

describe('tenant routes under the templated layout', () => {
  it('never re-append the tenant name to their title', () => {
    const root = join(process.cwd(), 'src/app/[tenant]')
    const offenders = walk(root)
      .filter((file) => /\/(page|layout)\.tsx$/.test(file) && !file.endsWith('src/app/[tenant]/layout.tsx'))
      .filter((file) => /title:\s*`[^`]*\|\s*\$\{[^`]*`/.test(readFileSync(file, 'utf8')))
      .map((file) => file.replace(root, ''))

    expect(offenders).toEqual([])
  })
})
