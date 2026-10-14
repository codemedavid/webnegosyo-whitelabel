/**
 * The nightly CI job reruns property tests at 5000 runs (`npm run
 * test:property`, which picks files by name). A property living in an
 * ordinary `*.test.ts`, or one that hard-codes its own run count, would
 * silently miss the nightly depth.
 */
import { readdirSync, readFileSync } from 'fs'
import path from 'path'

const TESTS_ROOT = path.join(process.cwd(), 'tests')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : []
  })
}

/** Files that import fast-check and assert a property with it (this one only names them). */
const propertyFiles = sourceFiles(TESTS_ROOT).filter((file) => {
  if (file === __filename) return false
  const source = readFileSync(file, 'utf8')
  return /from 'fast-check'/.test(source) && source.includes('fc.assert(')
})
const relative = (file: string) => path.relative(process.cwd(), file)

describe('property test conventions', () => {
  it('finds the property suites (guards the scan itself)', () => {
    expect(propertyFiles.length).toBeGreaterThanOrEqual(3)
  })

  it('keeps every fast-check property in a *.property.test.* file', () => {
    const misnamed = propertyFiles.filter((file) => !/\.property\.test\.tsx?$/.test(file)).map(relative)
    expect(misnamed).toEqual([])
  })

  it('takes every run count from propertyParameters, so FC_NUM_RUNS reaches it', () => {
    const fixed = propertyFiles.filter((file) => !readFileSync(file, 'utf8').includes('propertyParameters(')).map(relative)
    expect(fixed).toEqual([])
  })
})
