/** @jest-environment node */
import { withActionStatuses } from '@/lib/assistant/actions/status'
import type { StoredMessage } from '@/lib/assistant/history'
import type { BoostWorkspace } from '@/lib/boost/workspace'

jest.mock('server-only', () => ({}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))

describe('withActionStatuses', () => {
  test('re-tells the model the CURRENT status of each proposal', () => {
    const messages: StoredMessage[] = [
      { id: 'u', role: 'user', parts: [{ type: 'text', text: 'add sisig' }] },
      {
        id: 'a',
        role: 'assistant',
        parts: [{ type: 'tool-propose_menu_item', state: 'output-available', output: { facts: { proposed: true, status: 'pending' }, card: { type: 'confirm', actionId: 'act-1' } } }],
      },
    ]

    const patched = withActionStatuses(messages, new Map([['act-1', 'applied']]))

    expect((patched[1].parts[0].output as { facts: { status: string } }).facts.status).toBe('applied')
    expect((messages[1].parts[0].output as { facts: { status: string } }).facts.status).toBe('pending')
  })
})

describe('validateOffer', () => {
  const item = (id: string, name: string, price: number, categoryName: string) => ({ id, name, price, imageUrl: null, categoryId: null, categoryName, isAvailable: true, role: 'main' })
  const workspace = {
    isEnabled: true,
    items: [item('a', 'Sisig', 180, 'Mains'), item('b', 'Iced Tea', 60, 'Drinks'), item('c', 'Large Sisig', 240, 'Mains')],
    combos: [],
    upgrades: [],
    pairings: [],
    lastCall: { enabled: false, title: '', subtitle: '', maxItems: 4, pickedItemIds: [] },
    ideas: [],
    historyOrders: null,
    performance: null,
  } as unknown as BoostWorkspace
  const refs = { i1: 'a', i2: 'b', i3: 'c' }

  test('accepts a combo priced below buying separately', async () => {
    const { validateOffer } = await import('@/lib/assistant/actions/offers')

    const idea = validateOffer({ combos: [{ name: 'Sisig Meal', price: 219, picks: [{ label: 'Main', items: ['i1'] }, { label: 'Drink', items: ['i2'] }] }] }, workspace, refs)

    expect(idea).toMatchObject({ kind: 'combo', price: 219, regularPrice: 240 })
  })

  test('re-prices a combo that would cost more than its parts (the card shows the real price)', async () => {
    const { validateOffer } = await import('@/lib/assistant/actions/offers')

    const idea = validateOffer({ combos: [{ name: 'Pricey', price: 300, picks: [{ label: 'Main', items: ['i1'] }, { label: 'Drink', items: ['i2'] }] }] }, workspace, refs)

    expect(idea).toMatchObject({ kind: 'combo', regularPrice: 240 })
    expect(idea?.kind === 'combo' && idea.price).toBeLessThan(240)
  })

  test('refuses an upgrade to something cheaper, and unknown refs', async () => {
    const { validateOffer } = await import('@/lib/assistant/actions/offers')

    expect(validateOffer({ upgrades: [{ from: 'i3', to: 'i1', header: 'Go small?' }] }, workspace, refs)).toBeNull()
    expect(validateOffer({ upgrades: [{ from: 'i1', to: 'i99', header: 'x' }] }, workspace, refs)).toBeNull()
    expect(validateOffer({ upgrades: [{ from: 'i1', to: 'i3', header: 'Make it large?' }] }, workspace, refs)).toMatchObject({ kind: 'upgrade', sourceId: 'a', targetId: 'c' })
  })
})

describe('projectedQuantity', () => {
  test('receive adds, waste subtracts (never below zero), count replaces', async () => {
    const { projectedQuantity } = await import('@/lib/assistant/tools/propose/stock')

    expect(projectedQuantity(2, 'receive', 3.5)).toBe(5.5)
    expect(projectedQuantity(2, 'waste', 5)).toBe(0)
    expect(projectedQuantity(2, 'count', 7)).toBe(7)
  })
})

describe('proposal facts', () => {
  test('tell the model nothing has changed yet', async () => {
    jest.resetModules()
    jest.doMock('@/lib/assistant/actions/store', () => ({ createPendingAction: async () => ({ id: 'act-9', expiresAt: '2026-10-06T10:00:00Z' }) }))
    const { fileProposal } = await import('@/lib/assistant/tools/propose/shared')

    const result = await fileProposal(
      { tenantId: 't', tenantSlug: 's', conversationId: 'c', caller: { userId: 'u', role: 'admin', is_owner: true, permissions: null }, flags: { inventoryEnabled: true, customerHubOn: true, menuEngineeringEnabled: true }, refs: { refFor: jest.fn(), resolve: jest.fn(), snapshot: jest.fn() }, memo: jest.fn() } as never,
      { kind: 'menu_item', payload: {}, summary: 'Add Sisig', title: 'New dish: Sisig', lines: [] },
    )

    expect(result.facts).toMatchObject({ proposed: true, status: 'pending' })
    expect(String(result.facts.note)).toMatch(/nothing has changed/i)
    expect(result.card).toMatchObject({ type: 'confirm', actionId: 'act-9' })
  })
})
