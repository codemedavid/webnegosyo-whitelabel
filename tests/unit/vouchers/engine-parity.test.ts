/**
 * Parity: the register's copy of the voucher engine must be BYTE-IDENTICAL to
 * the web's.
 *
 * The register prices vouchers locally — it has to work on a flaky connection
 * at a counter — so the same voucher is evaluated by two codebases. If they
 * disagree by so much as a rounding step, a customer is quoted one figure
 * online and charged another in the shop, and the merchant has no way to say
 * which was right.
 *
 * Byte equality rather than behavioural equality, because behavioural parity
 * only proves the cases someone thought to write down. These modules were
 * built to be portable (no Supabase, Convex or React types anywhere in them),
 * so verbatim copying costs nothing and drift becomes impossible rather than
 * merely unlikely.
 *
 * If this fails: copy the web file over the app file. Do not "fix" the app
 * copy — the web copy is the original and the one the server prices with.
 */
import { describe, it, expect } from '@jest/globals'
import { readFileSync } from 'fs'
import { join } from 'path'

const WEB_DIR = join(process.cwd(), 'src/lib/vouchers')
const APP_DIR = join(process.cwd(), 'webnegosyo-app/lib/vouchers')

/**
 * The pure engine, and only the engine.
 *
 * `repository.ts`, `resolve.ts` and `order-pricing.ts` are deliberately absent:
 * they reach a database, and the register reaches a different one. `mapper.ts`
 * is absent for the same reason — it decodes a Postgres row shape.
 */
const PORTED_MODULES = ['types.ts', 'eligibility.ts', 'discount.ts', 'stacking.ts'] as const

function read(dir: string, file: string): string {
  return readFileSync(join(dir, file), 'utf8')
}

describe('voucher engine parity — web vs merchant app', () => {
  it.each(PORTED_MODULES)('%s is byte-identical', (file) => {
    expect(read(APP_DIR, file)).toBe(read(WEB_DIR, file))
  })

  it('ports the type the engine returns its lines in', () => {
    // stacking.ts imports OrderDiscountLine from '../order-totals'. The app
    // needs that path to resolve for the copy to be verbatim, even though the
    // register's own arithmetic lives in pos-cart.ts.
    const appTypes = readFileSync(
      join(process.cwd(), 'webnegosyo-app/lib/order-totals.ts'),
      'utf8',
    )

    expect(appTypes).toContain('export interface OrderDiscountLine')
  })
})
