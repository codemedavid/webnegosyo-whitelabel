import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The app prints with `webnegosyo-app/lib/receipt-layout.ts`; the web admin
 * previews and browser-prints with `src/lib/receipt-layout.ts`. They are kept
 * as two copies on purpose, and a change made to only one shows the merchant
 * a receipt in the Studio that their printer will not produce.
 */
function codeOf(path: string): string {
  const source = readFileSync(join(process.cwd(), path), 'utf8')
  // The header comment names the other copy, so it is the one place they differ.
  return source.replace(/\/\*\*\n \* Block-based receipt rendering\.[\s\S]*?\*\/\n/, '')
}

describe('receipt engine mirrors', () => {
  it('the app and web copies hold the same code', () => {
    expect(codeOf('src/lib/receipt-layout.ts')).toBe(codeOf('webnegosyo-app/lib/receipt-layout.ts'))
  })
})
