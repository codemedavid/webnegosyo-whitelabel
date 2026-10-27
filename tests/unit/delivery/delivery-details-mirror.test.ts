import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The merchant app reads an order's unit / landmark / rider note with its own
 * copy of the web's lookup (it cannot import from src/). A rule changed in one
 * copy only would show the merchant a different landmark than the rider got.
 */
function codeOf(path: string): string {
  const source = readFileSync(join(process.cwd(), path), 'utf8')
  // The header comment names the other copy, so it is the one place they differ.
  return source.replace(/^\/\*\*[\s\S]*?\*\/\n/, '')
}

describe('delivery details mirrors', () => {
  it('the app and web copies hold the same code', () => {
    expect(codeOf('webnegosyo-app/lib/delivery-details.ts')).toBe(codeOf('src/lib/delivery/delivery-details.ts'))
  })
})
