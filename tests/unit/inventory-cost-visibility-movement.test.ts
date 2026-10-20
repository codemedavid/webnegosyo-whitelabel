import { movementInputForCaller, movementResultForCaller } from '@/lib/inventory/cost-visibility'

const clerk = { role: 'admin', is_owner: false, permissions: ['inventory'] }
const buyer = { role: 'admin', is_owner: false, permissions: ['inventory', 'costs'] }

describe('movementInputForCaller', () => {
  it('records a clerk\'s delivery uncosted, leaving the ingredient cost alone', () => {
    const input = { reason: 'receive', unit_cost: 9999 }
    expect(movementInputForCaller(input, clerk)).toEqual({ reason: 'receive', unit_cost: undefined })
    expect(input.unit_cost).toBe(9999)
  })

  it('keeps the price for an account holding costs', () => {
    expect(movementInputForCaller({ unit_cost: 52.5 }, buyer)).toEqual({ unit_cost: 52.5 })
  })
})

describe('movementResultForCaller', () => {
  const result = { movement: { id: 'm', unit_cost: 0.33 }, item: { id: 'i', unit_cost: 0.33 }, alreadyRecorded: false }

  it('leaves the frozen cost out, absent rather than 0', () => {
    const shown = movementResultForCaller(result, clerk)
    expect(shown.movement).toEqual({ id: 'm' })
    expect(shown.item).toEqual({ id: 'i' })
    expect(shown.alreadyRecorded).toBe(false)
  })

  it('shows it to an account holding costs', () => {
    expect(movementResultForCaller(result, buyer)).toBe(result)
  })
})
