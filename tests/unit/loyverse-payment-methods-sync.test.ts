import { planPaymentMethodSync } from '@/lib/loyverse/payment-methods-sync'
import type { SyncablePaymentMethod } from '@/lib/loyverse/payment-methods-sync'
import type { LoyversePaymentType } from '@/lib/loyverse/client'

function loyverseType(overrides: Partial<LoyversePaymentType> = {}): LoyversePaymentType {
  return { id: 'pt_cash', name: 'Cash', type: 'CASH', ...overrides }
}

function existingMethod(overrides: Partial<SyncablePaymentMethod> = {}): SyncablePaymentMethod {
  return {
    id: 'pm_1',
    name: 'Cash',
    is_active: true,
    order_index: 0,
    loyverse_payment_type_id: 'pt_cash',
    ...overrides,
  }
}

describe('planPaymentMethodSync — creates', () => {
  it('creates a method for a Loyverse payment type with no mapped row', () => {
    const plan = planPaymentMethodSync([loyverseType()], [])

    expect(plan.creates).toEqual([
      { name: 'Cash', loyverse_payment_type_id: 'pt_cash', is_active: true, order_index: 0 },
    ])
    expect(plan.renames).toEqual([])
    expect(plan.deactivates).toEqual([])
  })

  it('appends new methods after the highest existing order_index', () => {
    const manual = existingMethod({
      id: 'pm_manual',
      name: 'GCash',
      order_index: 4,
      loyverse_payment_type_id: null,
    })

    const plan = planPaymentMethodSync([loyverseType({ id: 'pt_card', name: 'Card' })], [manual])

    expect(plan.creates).toEqual([
      { name: 'Card', loyverse_payment_type_id: 'pt_card', is_active: true, order_index: 5 },
    ])
  })

  it('numbers multiple creates sequentially', () => {
    const plan = planPaymentMethodSync(
      [loyverseType(), loyverseType({ id: 'pt_card', name: 'Card' })],
      []
    )

    expect(plan.creates.map((c) => c.order_index)).toEqual([0, 1])
  })
})

describe('planPaymentMethodSync — renames', () => {
  it('renames a mapped method whose Loyverse name changed, touching only the name', () => {
    const plan = planPaymentMethodSync(
      [loyverseType({ name: 'Cash (PHP)' })],
      [existingMethod()]
    )

    expect(plan.renames).toEqual([{ id: 'pm_1', name: 'Cash (PHP)' }])
    expect(plan.creates).toEqual([])
    expect(plan.deactivates).toEqual([])
  })

  it('does not rename when the name is unchanged', () => {
    const plan = planPaymentMethodSync([loyverseType()], [existingMethod()])

    expect(plan.renames).toEqual([])
  })

  it('reactivates a mapped method that was deactivated but exists again in Loyverse', () => {
    const plan = planPaymentMethodSync(
      [loyverseType()],
      [existingMethod({ is_active: false })]
    )

    expect(plan.reactivates).toEqual(['pm_1'])
  })
})

describe('planPaymentMethodSync — deactivates', () => {
  it('deactivates a mapped method whose Loyverse payment type disappeared', () => {
    const plan = planPaymentMethodSync([], [existingMethod()])

    expect(plan.deactivates).toEqual(['pm_1'])
  })

  it('never touches manual methods without a Loyverse link', () => {
    const manual = existingMethod({ id: 'pm_manual', name: 'GCash', loyverse_payment_type_id: null })

    const plan = planPaymentMethodSync([], [manual])

    expect(plan.creates).toEqual([])
    expect(plan.renames).toEqual([])
    expect(plan.deactivates).toEqual([])
  })

  it('does not re-deactivate an already inactive mapped method', () => {
    const plan = planPaymentMethodSync([], [existingMethod({ is_active: false })])

    expect(plan.deactivates).toEqual([])
  })
})

describe('planPaymentMethodSync — edge cases', () => {
  it('skips Loyverse payment types with blank names and reports a warning', () => {
    const plan = planPaymentMethodSync([loyverseType({ id: 'pt_blank', name: '  ' })], [])

    expect(plan.creates).toEqual([])
    expect(plan.warnings).toHaveLength(1)
    expect(plan.warnings[0]).toContain('pt_blank')
  })

  it('is a no-op when everything already matches', () => {
    const plan = planPaymentMethodSync(
      [loyverseType(), loyverseType({ id: 'pt_card', name: 'Card' })],
      [
        existingMethod(),
        existingMethod({ id: 'pm_2', name: 'Card', loyverse_payment_type_id: 'pt_card', order_index: 1 }),
      ]
    )

    expect(plan.creates).toEqual([])
    expect(plan.renames).toEqual([])
    expect(plan.deactivates).toEqual([])
    expect(plan.reactivates).toEqual([])
  })
})
