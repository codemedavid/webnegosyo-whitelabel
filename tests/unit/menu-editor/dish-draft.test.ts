import { isDraftChanged, serializeDraft } from '@/lib/menu-editor/dish-draft'

describe('serializeDraft', () => {
  it('ignores the order keys were written in', () => {
    expect(serializeDraft({ a: 1, b: { c: 2, d: 3 } })).toBe(serializeDraft({ b: { d: 3, c: 2 }, a: 1 }))
  })

  it('treats a key set to undefined the same as a missing key', () => {
    expect(serializeDraft({ name: 'Rice', manual_cost: undefined })).toBe(serializeDraft({ name: 'Rice' }))
  })

  it('keeps array order, because option order is what the customer sees', () => {
    expect(serializeDraft({ options: ['Hot', 'Cold'] })).not.toBe(serializeDraft({ options: ['Cold', 'Hot'] }))
  })
})

describe('isDraftChanged', () => {
  const baseline = serializeDraft({ name: 'Milk tea', price: '120', groups: [{ id: 'g', options: [{ id: 'o', price_modifier: 10 }] }] })

  it('is false when nothing changed', () => {
    expect(isDraftChanged(baseline, { price: '120', name: 'Milk tea', groups: [{ options: [{ price_modifier: 10, id: 'o' }], id: 'g' }] })).toBe(false)
  })

  it('is true when a nested option price changed', () => {
    expect(isDraftChanged(baseline, { name: 'Milk tea', price: '120', groups: [{ id: 'g', options: [{ id: 'o', price_modifier: 15 }] }] })).toBe(true)
  })
})
