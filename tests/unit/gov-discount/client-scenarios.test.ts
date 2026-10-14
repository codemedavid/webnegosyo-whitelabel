/**
 * The two cases the client asked about, priced to the centavo and then
 * re-priced the way the server re-checks a register's grant:
 *
 * A. Only SOME units of a line are the claimant's (the table ordered 5 fries,
 *    1 is the senior's) — only that one unit is discounted.
 * B. One qualified diner in a group (DSWD/NCMB Res. 3-2009) — the shared food
 *    is divided by the diners and only the claimant's part is discounted.
 */
import { describe, it, expect } from '@jest/globals'
import {
  computeGovDiscount,
  defaultTaxProfile,
  type GovClaimantInput,
  type GovDiscountInput,
  type RecordGovDiscountRequest,
  type StoredGovDiscount,
} from '@/lib/gov-discount'
import { verifyGrant } from '@/lib/gov-discount-ledger/verify'

const fries = (amount = 560, quantity = 5) => ({
  key: 'fries',
  name: 'Fries',
  quantity,
  amount,
  eligible: true,
})

const senior = (allocation: GovClaimantInput['allocation']): GovClaimantInput => ({
  id: 'c1',
  kind: 'senior',
  name: 'Juan Dela Cruz',
  idNumber: '12345',
  allocation,
})

function priced(input: GovDiscountInput) {
  const result = computeGovDiscount(input)
  if (!result.ok) throw new Error(JSON.stringify(result.problems))
  return result
}

describe('A. one of five fries is the senior’s', () => {
  it('VAT store: only one ₱112 fries loses its VAT and 20% — table pays ₱528', () => {
    const result = priced({
      vatStatus: 'vat',
      lines: [fries()],
      claimants: [senior({ mode: 'items', units: { fries: 1 } })],
    })
    const [claimant] = result.claimants

    expect(claimant.grossShare).toBe(112)
    expect(claimant.vatExemptSales).toBe(100)
    expect(claimant.vatRemoved).toBe(12)
    expect(claimant.discount).toBe(20)
    expect(claimant.netDue).toBe(80)
    expect(result.totalReduction).toBe(32)
    expect(result.lineReductions).toEqual({ fries: 32 })
    expect(560 - result.totalReduction).toBe(528)
  })

  it('non-VAT store: 20% off one fries only — table pays ₱537.60', () => {
    const result = priced({
      vatStatus: 'non_vat',
      lines: [fries()],
      claimants: [senior({ mode: 'items', units: { fries: 1 } })],
    })
    const [claimant] = result.claimants

    expect(claimant.grossShare).toBe(112)
    expect(claimant.vatRemoved).toBe(0)
    expect(claimant.discount).toBe(22.4)
    expect(claimant.netDue).toBe(89.6)
    expect(560 - result.totalReduction).toBeCloseTo(537.6, 2)
  })

  it('two seniors each claiming one fries never touch the other three', () => {
    const result = priced({
      vatStatus: 'vat',
      lines: [fries()],
      claimants: [
        senior({ mode: 'items', units: { fries: 1 } }),
        { ...senior({ mode: 'items', units: { fries: 1 } }), id: 'c2', idNumber: '67890' },
      ],
    })

    expect(result.claimants.map((c) => c.grossShare)).toEqual([112, 112])
    expect(result.totalReduction).toBe(64)
  })
})

describe('B. one senior at a table of four (DSWD/NCMB Res. 3-2009)', () => {
  it('₱2,000 VAT store: senior’s ₱500 part → ₱357.14, table pays ₱1,857.14', () => {
    const result = priced({
      vatStatus: 'vat',
      lines: [{ key: 'platter', name: 'Platter', quantity: 1, amount: 2000, eligible: true }],
      diners: 4,
      allowShared: true,
      claimants: [senior({ mode: 'shared' })],
    })
    const [claimant] = result.claimants

    expect(claimant.grossShare).toBe(500)
    expect(claimant.vatExemptSales).toBe(446.43)
    expect(claimant.vatRemoved).toBe(53.57)
    expect(claimant.discount).toBe(89.29)
    expect(claimant.netDue).toBe(357.14)
    expect(result.totalReduction).toBe(142.86)
    expect(2000 - result.totalReduction).toBeCloseTo(1857.14, 2)
  })

  it('refuses a shared split on take-out / delivery', () => {
    const result = computeGovDiscount({
      vatStatus: 'vat',
      lines: [{ key: 'platter', name: 'Platter', quantity: 1, amount: 2000, eligible: true }],
      diners: 4,
      allowShared: false,
      claimants: [senior({ mode: 'shared' })],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problems.map((p) => p.code)).toContain('shared_not_allowed')
  })
})

describe('the server re-check agrees with the register', () => {
  const profile = defaultTaxProfile('vat')

  function request(
    government: StoredGovDiscount,
    lines: RecordGovDiscountRequest['lines'],
  ): RecordGovDiscountRequest {
    return {
      tenantId: '11111111-1111-4111-8111-111111111111',
      backend: 'platform_supabase',
      externalOrderId: '22222222-2222-4222-8222-222222222222',
      orderLabel: '#12',
      outletId: null,
      revision: 0,
      occurredAt: '2026-10-12T04:00:00.000Z',
      orderTotal: 0,
      source: 'pos',
      lines,
      serviceCharge: 0,
      deliveryFee: 0,
      allowShared: true,
      government,
      approvalId: null,
      approvalSkippedOffline: false,
    }
  }

  function stored(input: GovDiscountInput): StoredGovDiscount {
    const result = priced(input)
    return {
      version: 1,
      vatStatus: input.vatStatus,
      serviceChargeMode: 'full',
      diners: input.diners ?? null,
      claimants: result.claimants,
      vat: null,
    }
  }

  const verify = (req: RecordGovDiscountRequest, saved: { menuItemId: string; quantity: number; amount: number }[]) =>
    verifyGrant({
      request: req,
      profile,
      excludedMenuItemIds: new Set(),
      savedLines: saved,
      isApproved: true,
      isSelfApproved: false,
    })

  it('1 of 5 fries: verified, server reduction ₱32', () => {
    const government = stored({
      vatStatus: 'vat',
      lines: [fries()],
      claimants: [senior({ mode: 'items', units: { fries: 1 } })],
    })
    const line = { key: 'fries', menuItemId: 'm-fries', name: 'Fries', quantity: 5, amount: 560 }
    const verdict = verify(request(government, [line]), [{ menuItemId: 'm-fries', quantity: 5, amount: 560 }])

    expect(verdict.verification).toBe('verified')
    expect(verdict.claimants[0].serverReduction).toBe(32)
    expect(verdict.claimants[0].flags).not.toContain('amount_mismatch')
  })

  it('a register that discounts all five fries for a 1-unit claim is flagged', () => {
    const honest = stored({
      vatStatus: 'vat',
      lines: [fries()],
      claimants: [senior({ mode: 'items', units: { fries: 1 } })],
    })
    const inflated: StoredGovDiscount = {
      ...honest,
      claimants: honest.claimants.map((claimant) => ({ ...claimant, reduction: 160 })),
    }
    const line = { key: 'fries', menuItemId: 'm-fries', name: 'Fries', quantity: 5, amount: 560 }
    const verdict = verify(request(inflated, [line]), [{ menuItemId: 'm-fries', quantity: 5, amount: 560 }])

    expect(verdict.verification).toBe('mismatch')
    expect(verdict.claimants[0].flags).toContain('amount_mismatch')
  })

  it('one senior at a table of four: verified, server reduction ₱142.86', () => {
    const government = stored({
      vatStatus: 'vat',
      lines: [{ key: 'platter', name: 'Platter', quantity: 1, amount: 2000, eligible: true }],
      diners: 4,
      allowShared: true,
      claimants: [senior({ mode: 'shared' })],
    })
    const line = { key: 'platter', menuItemId: 'm-platter', name: 'Platter', quantity: 1, amount: 2000 }
    const verdict = verify(request(government, [line]), [{ menuItemId: 'm-platter', quantity: 1, amount: 2000 }])

    expect(verdict.verification).toBe('verified')
    expect(verdict.claimants[0].serverReduction).toBe(142.86)
  })
})
