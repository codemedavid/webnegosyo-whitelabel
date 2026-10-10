/**
 * @jest-environment node
 *
 * sharp's native binary is only bundled for routes listed in next.config.ts
 * `outputFileTracingIncludes`. A module that imports sharp at the top level
 * kills its whole route when the binary is missing (onboarding submit,
 * 2026-10-10), so static imports stay inside the wallet-pass engine — whose
 * routes are listed — and everything else loads sharp lazily.
 */
import { describe, it, expect } from '@jest/globals'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

const ROOT = join(__dirname, '../../..')
const STATIC_SHARP_IMPORT = /^\s*import\s+[^'"]*from\s+['"]sharp['"]/m
const ALLOWED_STATIC_IMPORTERS = /^src\/lib\/loyalty\/wallet-pass\//

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

describe('sharp is traced wherever it can load', () => {
  it('imports sharp statically only from the wallet-pass engine', () => {
    const offenders = sourceFiles(join(ROOT, 'src'))
      .filter((path) => STATIC_SHARP_IMPORT.test(readFileSync(path, 'utf8')))
      .map((path) => relative(ROOT, path))
      .filter((path) => !ALLOWED_STATIC_IMPORTERS.test(path))
    expect(offenders).toEqual([])
  })

  it('bundles the native binary for every route that reaches sharp', () => {
    const config = readFileSync(join(ROOT, 'next.config.ts'), 'utf8')
    for (const route of ['/api/loyalty/passes/**', '/api/onboarding/**', '/superadmin/checkout-leads/**']) {
      expect(config).toContain(`"${route}": [SHARP_NATIVE_FILES]`)
    }
  })
})
