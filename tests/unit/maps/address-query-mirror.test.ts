import { readFileSync } from 'fs'
import { join } from 'path'

/** The register cleans a typed address the same way the checkout does; the app cannot import from src/. */
function codeOf(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8').replace(/^\/\*\*[\s\S]*?\*\/\n/, '')
}

describe('address query mirror', () => {
  it('the app and web copies hold the same code', () => {
    expect(codeOf('webnegosyo-app/lib/maps/address-query.ts')).toBe(codeOf('src/lib/maps/address-query.ts'))
  })
})
