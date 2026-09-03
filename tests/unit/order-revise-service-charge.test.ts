/**
 * A Convex order must STORE the service charge it was billed for.
 *
 * The Convex orders table has never had a field for it. `createOrder` took the
 * charge folded into `total` and nothing else; `reviseOrder` accepted a
 * `serviceChargeAmount` argument, added it to the total, and threw the figure
 * away. Every reader downstream — the order screen, the thermal receipt, the
 * next edit — saw only a gap between the items and the bill with nothing to
 * label it, which is exactly what a merchant reported as "an additional fee
 * without knowing what it is".
 *
 * The platform backend stores the same figure in `orders.service_charge_amount`;
 * this is the Convex half, and it mirrors `revisedDeliveryFeePatch` deliberately.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { revisedServiceChargePatch } from '../../convex-template/convex/orderRevise'

const convexFile = (name: string) =>
  readFileSync(join(__dirname, '..', '..', 'convex-template', 'convex', name), 'utf8')

describe('revisedServiceChargePatch', () => {
  it('stores the charge the edit settled on', () => {
    expect(revisedServiceChargePatch(24)).toEqual({ serviceCharge: 24 })
  })

  it('rounds to centavos, matching the total it sits beside', () => {
    expect(revisedServiceChargePatch(23.999)).toEqual({ serviceCharge: 24 })
  })

  it('clears the field when the edit left no charge', () => {
    // Patching undefined deletes the field in Convex — the same "no charge"
    // state the platform backend writes as NULL.
    expect(revisedServiceChargePatch(0)).toEqual({ serviceCharge: undefined })
  })

  it('leaves the stored charge alone when the caller sent none', () => {
    // App builds that predate the field omit the argument. Blanking it for
    // them would strip the charge off every legacy order on its first edit.
    expect(revisedServiceChargePatch(undefined)).toEqual({})
  })

  it('refuses a negative charge rather than crediting it', () => {
    // The residue may legitimately be negative; a SERVICE CHARGE may not.
    // Storing one would print a negative fee on a customer's receipt.
    expect(revisedServiceChargePatch(-10)).toEqual({ serviceCharge: undefined })
  })
})

describe('the orders schema', () => {
  it('has somewhere to put the charge', () => {
    expect(convexFile('schema.ts')).toMatch(/serviceCharge: v\.optional\(v\.number\(\)\)/)
  })
})

describe('the createOrder mutation', () => {
  it('accepts the charge so the register can record it', () => {
    // `createOrder` spreads its args into the insert, so accepting the field
    // is what persists it.
    expect(convexFile('orders.ts')).toMatch(/serviceCharge: v\.optional\(v\.number\(\)\)/)
  })
})

describe('the reviseOrder mutation', () => {
  it('applies the charge patch beside the total', () => {
    expect(convexFile('orders.ts')).toMatch(/revisedServiceChargePatch\(args\.serviceCharge\)/)
  })

  it('still totals from serviceChargeAmount alone', () => {
    // One money channel. If the named charge were ever added to the total as
    // well, every edited order would bill the service twice.
    expect(convexFile('orders.ts')).toMatch(
      /computeRevisedTotal\(\s*priced,\s*args\.deliveryFee,\s*args\.serviceChargeAmount\s*\)/,
    )
  })
})
