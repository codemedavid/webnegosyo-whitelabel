/**
 * "What happened?" chips at the end of a shift (CONTRACTS §6). The keys are
 * stored in `staff_shifts.variance_reason`, so they are a contract with the
 * database and the web; the labels are the copy deck in 06 §7.
 */
import {
  DEFAULT_REASON_FROM_CENTS,
  OVER_REASONS,
  SHORT_REASONS,
  countVerdict,
  isReasonRequired,
  isVarianceReasonKey,
  reasonLabel,
  reasonsFor,
} from '@/lib/cash/reasons'

describe('reason chips', () => {
  it('short list: keys and labels exactly as the contract', () => {
    expect(SHORT_REASONS.map((r) => [r.key, r.label])).toEqual([
      ['wrong_change', 'Wrong sukli (change)'],
      ['unrecorded_pay_out', 'Pay out not recorded'],
      ['counting_mistake', 'Counting mistake'],
      ['customer_paid_less', 'Customer paid less'],
      ['not_sure', 'Not sure'],
    ])
  })

  it('over list: keys and labels exactly as the contract', () => {
    expect(OVER_REASONS.map((r) => [r.key, r.label])).toEqual([
      ['customer_left_extra', 'Customer left extra'],
      ['unrecorded_pay_in', 'Pay in not recorded'],
      ['counting_mistake', 'Counting mistake'],
      ['not_sure', 'Not sure'],
    ])
  })

  it('reasonsFor picks the list by the sign of counted − expected', () => {
    expect(reasonsFor(-120)).toBe(SHORT_REASONS)
    expect(reasonsFor(40)).toBe(OVER_REASONS)
    expect(reasonsFor(0)).toEqual([])
  })

  it('isVarianceReasonKey accepts only stored keys', () => {
    expect(isVarianceReasonKey('wrong_change')).toBe(true)
    expect(isVarianceReasonKey('customer_left_extra')).toBe(true)
    expect(isVarianceReasonKey('Wrong sukli (change)')).toBe(false)
    expect(isVarianceReasonKey(null)).toBe(false)
    expect(isVarianceReasonKey('__proto__')).toBe(false)
  })

  it('reasonLabel reads a stored key, null for anything else', () => {
    expect(reasonLabel('unrecorded_pay_out')).toBe('Pay out not recorded')
    expect(reasonLabel('bogus')).toBeNull()
    expect(reasonLabel(null)).toBeNull()
  })
})

describe('when a reason is needed', () => {
  it('defaults to more than ₱20 either way', () => {
    expect(DEFAULT_REASON_FROM_CENTS).toBe(2000)
    expect(isReasonRequired(-2000)).toBe(false)
    expect(isReasonRequired(-2001)).toBe(true)
    expect(isReasonRequired(2001)).toBe(true)
    expect(isReasonRequired(0)).toBe(false)
  })

  it('follows the store threshold', () => {
    expect(isReasonRequired(500, 0)).toBe(true)
    expect(isReasonRequired(500, 1000)).toBe(false)
  })

  it('countVerdict says exact / short / over', () => {
    expect(countVerdict(0)).toBe('exact')
    expect(countVerdict(-1)).toBe('short')
    expect(countVerdict(1)).toBe('over')
  })
})
