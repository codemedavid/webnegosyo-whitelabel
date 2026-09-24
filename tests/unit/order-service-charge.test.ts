import { describe, it, expect } from '@jest/globals'
import { computeServiceCharge } from '@/lib/order-service-charge'

/**
 * The service charge used to arrive as a number from the browser and be
 * stored as sent — `serviceChargeAmount: -500` took ₱500 off the bill. It is
 * now recomputed from the tenant's own order type, with the same formula the
 * checkout shows (src/hooks/useCheckout.ts), against the server-verified
 * item subtotal.
 */

describe('computeServiceCharge', () => {
  it('charges nothing when the order type has it switched off', () => {
    expect(computeServiceCharge({ service_charge_enabled: false, service_charge_type: 'fixed', service_charge_value: 50 }, 1000)).toBe(0)
  })

  it('charges nothing without an order type', () => {
    expect(computeServiceCharge(null, 1000)).toBe(0)
  })

  it('charges a percentage of the item subtotal, rounded to centavos', () => {
    expect(computeServiceCharge({ service_charge_enabled: true, service_charge_type: 'percentage', service_charge_value: 10 }, 333.33)).toBe(33.33)
  })

  it('matches the checkout arithmetic exactly', () => {
    const subtotal = 1234.56
    const value = 7.5
    const checkout = Math.round(subtotal * (value / 100) * 100) / 100

    expect(computeServiceCharge({ service_charge_enabled: true, service_charge_type: 'percentage', service_charge_value: value }, subtotal)).toBe(checkout)
  })

  it('charges a fixed amount as configured', () => {
    expect(computeServiceCharge({ service_charge_enabled: true, service_charge_type: 'fixed', service_charge_value: 25 }, 1000)).toBe(25)
  })

  it('reads a numeric string the way Postgres numeric can arrive', () => {
    expect(computeServiceCharge({ service_charge_enabled: true, service_charge_type: 'fixed', service_charge_value: '25.50' }, 1000)).toBe(25.5)
  })

  it.each([
    ['negative', -10],
    ['zero', 0],
    ['NaN', Number.NaN],
    ['null', null],
  ])('charges nothing for a %s value', (_label, value) => {
    expect(computeServiceCharge({ service_charge_enabled: true, service_charge_type: 'fixed', service_charge_value: value }, 1000)).toBe(0)
  })
})
