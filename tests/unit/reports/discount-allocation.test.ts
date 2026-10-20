/**
 * An order's discount, split by kind and between the food and the delivery.
 *
 * The stored payload's `total` is what came off the bill (lines + delivery);
 * its lines are the labels. Kinds are read from the labels the register and
 * the voucher engine write today (live examples in each case).
 */
import { classifyDiscountLine, splitOrderDiscount } from '@/lib/reports/discount-allocation'

describe('classifyDiscountLine', () => {
  test.each([
    [{ label: 'Discount — PWD SYROSS', amount: 59.8 }, 'pwd'],
    [{ label: 'Person with Disability', amount: 2.78, code: 'PWD', voucherId: 'v1' }, 'pwd'],
    [{ label: 'Discount — Senior - SABARRE', amount: 29.9 }, 'senior'],
    [{ label: 'Senior Citizen', amount: 20, voucherId: 'v2' }, 'senior'],
    [{ label: 'SENIOR/PWD', amount: 17.8, code: 'SENIOR/PWD', voucherId: 'v3' }, 'senior_pwd'],
    [{ label: 'Staff Discount', amount: 5.65, code: 'STAFF5%', voucherId: 'v4' }, 'voucher'],
    [{ label: 'Discount — Employee Mariell', amount: 35.06 }, 'manual'],
    [{ label: 'Discount - vip', amount: 29.9 }, 'manual'],
    [{ label: 'Free delivery weekend', amount: 49 }, 'promo'],
    [{ label: "Senior's Day promo", amount: 20, voucherId: 'v5' }, 'voucher'],
  ] as const)('%o is %s', (stored, kind) => {
    expect(classifyDiscountLine(stored)).toBe(kind)
  })
})

describe('splitOrderDiscount', () => {
  test('no payload is no discount', () => {
    const split = splitOrderDiscount(null, 0)
    expect(split.foodCents).toBe(0)
    expect(split.deliveryCents).toBe(0)
    expect(Object.values(split.byKind).every((cents) => cents === 0)).toBe(true)
  })

  test('the delivery part comes off the delivery fee, the rest off the food', () => {
    const split = splitOrderDiscount(
      { total: 79, deliveryDiscount: 49, lines: [{ label: 'Free delivery weekend', amount: 79 }], allocationsByLine: {} },
      4900,
    )
    expect(split).toMatchObject({ foodCents: 3000, deliveryCents: 4900 })
    expect(split.byKind.promo).toBe(7900)
  })

  test('a delivery discount larger than the fee spills onto the food', () => {
    const split = splitOrderDiscount({ total: 60, deliveryDiscount: 60, lines: [], allocationsByLine: {} }, 4000)
    expect(split).toMatchObject({ foodCents: 2000, deliveryCents: 4000 })
  })

  test('kinds add up to the stored total even when the lines do not', () => {
    // Stacked lines rounded separately: 33.33 + 33.33 + 33.33 ≠ 100.
    const split = splitOrderDiscount(
      {
        total: 100,
        deliveryDiscount: 0,
        lines: [
          { label: 'Senior Citizen', amount: 33.33, voucherId: 'v' },
          { label: 'Discount — owner', amount: 33.33 },
          { label: 'STAFF', amount: 33.33, voucherId: 'w' },
        ],
        allocationsByLine: {},
      },
      0,
    )
    expect(split.foodCents).toBe(10000)
    expect(split.byKind.senior + split.byKind.manual + split.byKind.voucher).toBe(10000)
    expect(split.byKind.senior).toBe(3334)
  })

  test('a payload without lines is a promo, and a negative or absurd total is no discount', () => {
    expect(splitOrderDiscount({ total: 10, deliveryDiscount: 0, lines: [], allocationsByLine: {} }, 0).byKind.promo).toBe(1000)
    expect(splitOrderDiscount({ total: -10, deliveryDiscount: 0, lines: [], allocationsByLine: {} }, 0).foodCents).toBe(0)
  })
})
