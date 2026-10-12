/**
 * Parity: the register's copy of the government-discount engine must be
 * BYTE-IDENTICAL to the web's.
 *
 * The register prices Senior/PWD discounts locally (it must work offline) and
 * the server re-prices every grant to verify it. If the two copies disagree by
 * one rounding step, every honest sale is flagged as a mismatch — or worse, a
 * real mismatch hides among false ones.
 *
 * If this fails: copy `src/lib/gov-discount/*` over the app's folder. Never
 * edit the app copy by hand.
 */
import { describe, it, expect } from '@jest/globals'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const WEB_DIR = join(process.cwd(), 'src/lib/gov-discount')
const APP_DIR = join(process.cwd(), 'webnegosyo-app/lib/gov-discount')

const modules = (dir: string) =>
  readdirSync(dir)
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
    .sort()

describe('government discount engine parity — web vs merchant app', () => {
  it('has the same modules in both codebases', () => {
    expect(modules(APP_DIR)).toEqual(modules(WEB_DIR))
  })

  it.each(modules(WEB_DIR))('%s is byte-identical', (file) => {
    expect(readFileSync(join(APP_DIR, file), 'utf8')).toBe(readFileSync(join(WEB_DIR, file), 'utf8'))
  })

  it('stays portable: no path aliases, frameworks or databases', () => {
    for (const file of modules(WEB_DIR)) {
      const source = readFileSync(join(WEB_DIR, file), 'utf8')
      expect(source).not.toMatch(/^import .*from '(@\/|[^']*supabase|[^']*convex|react)/im)
    }
  })
})
