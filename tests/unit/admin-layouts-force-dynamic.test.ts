/**
 * @jest-environment node
 */
/**
 * The production build of 2b1ce6b4 failed because Next tried to pre-render
 * `/superadmin/leads` and two sibling pages at build time: they read through
 * the service-role client, touch no cookies, and so looked static. With the
 * database stalled, each render hit the 120s static-generation limit three
 * times and the build died — leaving production on the build BEFORE the
 * middleware fix. Every admin surface is authenticated and per-request by
 * nature; pinning `force-dynamic` on the layouts keeps every page under them
 * (present and future) out of the build.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const MARKER = /export const dynamic = 'force-dynamic'/

describe('admin layouts are never pre-rendered at build time', () => {
  it.each(['src/app/superadmin/layout.tsx', 'src/app/[tenant]/admin/layout.tsx'])('%s opts out of static generation', (file) => {
    const source = readFileSync(join(process.cwd(), file), 'utf8')

    expect(source).toMatch(MARKER)
  })
})
