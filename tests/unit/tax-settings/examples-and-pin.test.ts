import { describe, expect, it } from '@jest/globals'
import { formatPeso, seniorMealExample } from '@/lib/tax-settings/vat-example'
import { approvalPinFormSchema, canHoldApprovalPin } from '@/lib/tax-settings/pin-schema'
import { describeLastChange } from '@/lib/tax-settings/last-change'

describe('seniorMealExample — the ₱560 example, from the engine', () => {
  it('takes VAT out first at a VAT-registered store: the senior pays ₱400', () => {
    expect(seniorMealExample('vat')).toEqual({ price: 560, pays: 400, vatRemoved: 60, discount: 100 })
  })

  it('takes 20% off the price at a non-VAT store: the senior pays ₱448', () => {
    expect(seniorMealExample('non_vat')).toEqual({ price: 560, pays: 448, vatRemoved: 0, discount: 112 })
  })
})

describe('formatPeso', () => {
  it('drops ".00" but keeps centavos', () => {
    expect(formatPeso(400)).toBe('₱400')
    expect(formatPeso(448.5)).toBe('₱448.50')
    expect(formatPeso(1500)).toBe('₱1,500')
  })
})

describe('approvalPinFormSchema', () => {
  const issuesOf = (values: unknown) => {
    const parsed = approvalPinFormSchema.safeParse(values)
    return parsed.success ? [] : parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
  }

  it('accepts 4 to 6 matching digits', () => {
    expect(issuesOf({ pin: '4826', confirmPin: '4826' })).toEqual([])
    expect(issuesOf({ pin: '482613', confirmPin: '482613' })).toEqual([])
  })

  it.each(['123', '1234567', '12a4', ''])('refuses %p', (pin) => {
    expect(issuesOf({ pin, confirmPin: pin })[0]).toBe('pin: Use 4 to 6 numbers')
  })

  it('refuses two PINs that differ', () => {
    expect(issuesOf({ pin: '4826', confirmPin: '4862' })).toEqual(['confirmPin: The two PINs do not match'])
  })
})

describe('canHoldApprovalPin', () => {
  it('lets a store account with discount review hold a PIN', () => {
    expect(canHoldApprovalPin({ role: 'admin', tenantId: 't1', hasReviewPermission: true }, 't1')).toBe(true)
  })

  it('refuses staff without the permission, other stores and superadmins', () => {
    expect(canHoldApprovalPin({ role: 'admin', tenantId: 't1', hasReviewPermission: false }, 't1')).toBe(false)
    expect(canHoldApprovalPin({ role: 'admin', tenantId: 't2', hasReviewPermission: true }, 't1')).toBe(false)
    expect(canHoldApprovalPin({ role: 'superadmin', tenantId: null, hasReviewPermission: true }, 't1')).toBe(false)
  })
})

describe('describeLastChange', () => {
  const change = { changedAt: '2026-10-12T07:04:00Z', changedBy: 'u1', changerName: 'Ana' }

  it('names the changer, in Manila time', () => {
    expect(describeLastChange(change, 'u2')).toMatch(/^Last changed by Ana on Oct 12, 2026.*3:04\sPM$/)
  })

  it('says "you" to the person who made the change', () => {
    expect(describeLastChange(change, 'u1')).toMatch(/^Last changed by you on /)
  })

  it('gives only the date when the changer is unknown', () => {
    expect(describeLastChange({ ...change, changedBy: null, changerName: null }, 'u1')).toMatch(/^Last changed on /)
  })

  it('says nothing for a store that was never set up', () => {
    expect(describeLastChange(null, 'u1')).toBeNull()
  })
})
