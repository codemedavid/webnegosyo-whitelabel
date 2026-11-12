/**
 * Guardrail: `createOrderAction` must connect the voucher pieces correctly.
 *
 * Every part is unit-tested on its own, so what is left to get wrong is the
 * wiring — and each way of getting it wrong mis-bills someone:
 *
 * - accepting a discount AMOUNT from the browser instead of codes lets anyone
 *   check out for nothing;
 * - passing the discount to one backend and not the others means the bug only
 *   appears for merchants on that backend;
 * - burning a redemption before the insert returns spends a use on an order
 *   that was never saved.
 *
 * Source-level because the action opens real Supabase and Convex clients across
 * three backends; the behaviour underneath is covered by the unit suites.
 */
import { describe, it, expect } from '@jest/globals'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const ACTION = join(process.cwd(), 'src/app/actions/orders.ts')
/** createOrderAction is a wrapper over the order engine; the wiring lives here. */
const ENGINE_DIR = join(process.cwd(), 'src/lib/checkout/place-order')
/** The engine file that hands the order to each backend. */
const WRITER = join(ENGINE_DIR, 'write-order.ts')

function readAction(): string {
  const engine = readdirSync(ENGINE_DIR)
    .filter((file) => file.endsWith('.ts'))
    .sort()
    .map((file) => readFileSync(join(ENGINE_DIR, file), 'utf8'))
  return [readFileSync(ACTION, 'utf8'), ...engine].join('\n')
}

function readWriter(): string {
  return readFileSync(WRITER, 'utf8')
}

describe('createOrderAction voucher wiring', () => {
  it('accepts voucher codes', () => {
    expect(readAction()).toContain('voucherCodes')
  })

  it('re-prices on the server rather than trusting a sent amount', () => {
    expect(readAction()).toContain('priceOrderWithVouchers')
  })

  it('never takes a discount amount as a parameter', () => {
    // The engine's own field names, as they would appear if someone added a
    // client-supplied amount to the signature.
    const signature = readAction().split(') {')[0]
    // The engine's input type is the other place a parameter could appear.
    const engineInput = readFileSync(join(ENGINE_DIR, 'types.ts'), 'utf8')
      .split('export interface PlaceOrderInput {')[1]
      .split('\n}')[0]

    for (const source of [signature, engineInput]) {
      expect(source).not.toMatch(/discountTotal\s*[?:]/)
      expect(source).not.toMatch(/discount_total\s*[?:]/)
    }
  })

  it('hands the priced discount to every order backend', () => {
    const source = readWriter()

    // One per backend: Convex and platform Supabase (positional — both take
    // it as a trailing argument).
    const handoffs = source.match(/pricing\.application\.discountLines/g) ?? []
    expect(handoffs).toHaveLength(2)
  })

  it('persists the discount breakdown alongside the order', () => {
    expect(readAction()).toContain('writeOrderDiscount')
  })

  it('burns redemptions only against a saved order id', () => {
    const source = readWriter()

    // Every burn is keyed on an id that came back from the insert — one per
    // backend, and never on an id the action made up before saving.
    const burns = source.match(/burnFor\([^)]*\)/g) ?? []
    expect(burns).toEqual(['burnFor(result.order.id)', 'burnFor(result.order.id)'])
  })
})
