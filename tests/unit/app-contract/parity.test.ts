/**
 * The customer app carries a copy of the contract (it cannot import from the
 * web's src/). A drifted copy means the app validates a different shape than
 * the server sends, so the copies must match byte for byte.
 * Fix a failure with `cd customer-app && npm run sync:contract`.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '../../..')
const SOURCE = join(ROOT, 'src/lib/app-contract')
const COPY = join(ROOT, 'customer-app/src/lib/contract')

const tsFiles = (dir: string) => readdirSync(dir).filter((name) => name.endsWith('.ts')).sort()

describe('customer app contract copy', () => {
  it('has exactly the same files as the source', () => {
    expect(tsFiles(COPY)).toEqual(tsFiles(SOURCE))
  })

  it.each(tsFiles(SOURCE))('%s is identical', (name) => {
    expect(readFileSync(join(COPY, name), 'utf8')).toBe(readFileSync(join(SOURCE, name), 'utf8'))
  })

  it('ships the same sample payloads the web tests validate', () => {
    const copy = readFileSync(join(ROOT, 'customer-app/src/fixtures/contract-fixtures.ts'), 'utf8')
    expect(copy).toBe(readFileSync(join(ROOT, 'tests/fixtures/app-contract.ts'), 'utf8'))
  })
})
