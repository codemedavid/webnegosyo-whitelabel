import {
  canApplyProposal,
  decideProposal,
  FREE_BOOST_AI_GENERATIONS,
  generationsLeft,
} from '@/lib/boost/ai/lifecycle'
import { ideaToWrite } from '@/lib/boost/idea-writes'
import type { ComboDraftItem } from '@/lib/boost/combo-draft'
import type { BoostLastCall } from '@/lib/boost/workspace'

describe('proposal lifecycle', () => {
  it('needs an approval before anything can be applied', () => {
    expect(canApplyProposal('pending')).toBe(false)
    expect(canApplyProposal('rejected')).toBe(false)
    expect(canApplyProposal('applied')).toBe(false)
    expect(canApplyProposal('approved')).toBe(true)
  })

  it('approves or rejects a pending proposal, and lets a rejection be reconsidered', () => {
    expect(decideProposal('pending', 'approve')).toBe('approved')
    expect(decideProposal('pending', 'reject')).toBe('rejected')
    expect(decideProposal('rejected', 'approve')).toBe('approved')
    expect(decideProposal('approved', 'reject')).toBe('rejected')
  })

  it('never re-decides an applied proposal or repeats a decision', () => {
    expect(decideProposal('applied', 'approve')).toBeNull()
    expect(decideProposal('applied', 'reject')).toBeNull()
    expect(decideProposal('approved', 'approve')).toBeNull()
    expect(decideProposal('rejected', 'reject')).toBeNull()
  })

  it('gives every store three free generations and never goes negative', () => {
    expect(FREE_BOOST_AI_GENERATIONS).toBe(3)
    expect(generationsLeft(0)).toBe(3)
    expect(generationsLeft(2)).toBe(1)
    expect(generationsLeft(7)).toBe(0)
  })
})

describe('ideaToWrite', () => {
  const items = new Map<string, ComboDraftItem>([
    ['burger', { id: 'burger', name: 'Burger', price: 120, categoryId: 'c1', categoryName: 'Burgers', role: 'main' }],
    ['fries', { id: 'fries', name: 'Fries', price: 60, categoryId: 'c2', categoryName: 'Sides', role: 'side' }],
    ['loose', { id: 'loose', name: 'Loose', price: 50, categoryId: null, categoryName: null, role: 'other' }],
  ])
  const lastCall: BoostLastCall = { enabled: false, title: 'Add to your order', subtitle: '', maxItems: 4, pickedItemIds: [] }

  it('turns a combo idea into a bundle write with its fixed price', () => {
    const write = ideaToWrite({
      kind: 'combo', id: 'x', title: 'Meal', reason: '', itemIds: ['burger', 'fries'], name: 'Burger Meal',
      picks: [{ label: 'Burger', itemIds: ['burger'] }, { label: 'Side', itemIds: ['fries'] }],
      regularPrice: 180, price: 159, savings: null,
    }, items, lastCall)

    expect(write.kind).toBe('combo')
    if (write.kind !== 'combo') return
    expect(write.input).toMatchObject({ name: 'Burger Meal', pricing_type: 'fixed', fixed_price: 159, is_active: true })
    expect(write.input.slots.map((s) => s.included_item_ids)).toEqual([['burger'], ['fries']])
  })

  it('asks for an edit when a combo item has no category', () => {
    const write = ideaToWrite({
      kind: 'combo', id: 'x', title: 'Loose', reason: '', itemIds: ['loose'], name: 'Loose Deal',
      picks: [{ label: 'A', itemIds: ['loose'] }, { label: 'B', itemIds: ['burger'] }],
      regularPrice: 170, price: 149, savings: null,
    }, items, lastCall)

    expect(write).toEqual({ kind: 'needs-edit' })
  })

  it('uses an AI last call picks and copy, and undoes back to the previous settings', () => {
    const write = ideaToWrite({
      kind: 'last_call', id: 'l', title: 'Kulang pa?', reason: '', itemIds: ['fries'],
      settings: { title: 'Kulang pa?', subtitle: 'Add fries', pickedItemIds: ['fries'] },
    }, items, lastCall)

    expect(write).toEqual({
      kind: 'last_call',
      input: { title: 'Kulang pa?', subtitle: 'Add fries', maxItems: 4, pickedItemIds: ['fries'], enabled: true },
      undo: { title: 'Add to your order', subtitle: '', maxItems: 4, pickedItemIds: [], enabled: false },
    })
  })

  it('keeps the automatic last call as it was when the idea has no picks', () => {
    const write = ideaToWrite({ kind: 'last_call', id: 'last_call', title: 't', reason: '', itemIds: [] }, items, lastCall)

    expect(write.kind === 'last_call' && write.input).toEqual({ ...lastCall, enabled: true })
  })
})
