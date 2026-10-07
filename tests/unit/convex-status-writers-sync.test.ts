/**
 * Every web-admin surface that moves a Convex order must tell the platform.
 *
 * Convex holds the order; the platform holds the customer ledger that visits
 * and loyalty stamps are computed from. A 2026-09 test found the web admin
 * changing Convex orders without posting the lifecycle sync, so completed
 * Convex orders never credited the customer. `notifyConvexLifecycleSync`
 * closed that for the order sheet — this pins it for any future writer: a file
 * that obtains a Convex status/payment mutation must post the sync at least as
 * often as it calls the mutation.
 */

import { describe, it, expect } from '@jest/globals'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

const SRC = join(__dirname, '..', '..', 'src')
const WRITER_HOOKS = /\buseUpdateConvex(?:OrderStatus|PaymentStatus)\(\)/
const HOOK_BINDING = /const\s+(\w+)\s*=\s*useUpdateConvex(?:OrderStatus|PaymentStatus)\(\)/g
const SYNC_CALL = /\bnotifyConvexLifecycleSync\(/g

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

function writerFiles(): string[] {
  return sourceFiles(SRC).filter((path) => {
    if (path.endsWith(join('hooks', 'use-convex-orders.ts'))) return false
    return WRITER_HOOKS.test(readFileSync(path, 'utf8'))
  })
}

function countMutationCalls(source: string): number {
  const names = [...source.matchAll(HOOK_BINDING)].map((match) => match[1])
  return names.reduce((total, name) => {
    const calls = source.match(new RegExp(`\\bawait\\s+${name}\\(`, 'g')) ?? []
    return total + calls.length
  }, 0)
}

describe('web-admin Convex status writers post the customer lifecycle sync', () => {
  const files = writerFiles()

  it('finds the known writer (guards the scan itself)', () => {
    const names = files.map((path) => relative(SRC, path))
    expect(names).toContain(join('components', 'admin', 'convex-order-sheet.tsx'))
  })

  it.each(files.map((path) => [relative(SRC, path), path]))(
    '%s syncs after every status or payment write',
    (_name, path) => {
      const source = readFileSync(path, 'utf8')
      const writes = countMutationCalls(source)
      const syncs = (source.match(SYNC_CALL) ?? []).length

      expect(writes).toBeGreaterThan(0)
      expect(syncs).toBeGreaterThanOrEqual(writes)
    },
  )
})
