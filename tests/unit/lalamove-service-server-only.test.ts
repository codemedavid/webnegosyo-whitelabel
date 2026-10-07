/** @jest-environment node */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `lalamove-service.ts` is a server library, not a set of Server Actions. A
 * top-level 'use server' turned every export (quotes, bookings, cancellations
 * with caller-supplied credentials) into a publicly callable endpoint. Its only
 * importers are a 'use server' action file and an API route, so it is marked
 * `server-only` instead: still unreachable from a client bundle, but no
 * longer an endpoint of its own.
 */
describe('lalamove-service module boundary', () => {
  const source = readFileSync(join(process.cwd(), 'src/lib/lalamove-service.ts'), 'utf8')

  it('is not a Server Actions module', () => {
    expect(source).not.toMatch(/^\s*['"]use server['"]/m)
  })

  it('is guarded as server-only', () => {
    expect(source).toMatch(/^import 'server-only'$/m)
  })
})
