import { runBoostAiGeneration, type GenerationDeps } from '@/lib/boost/ai/generate'
import type { BoostWorkspace } from '@/lib/boost/workspace'
import type { BasketSummary } from '@/lib/boost/order-baskets'

function workspace(overrides: Partial<BoostWorkspace> = {}): BoostWorkspace {
  return {
    isEnabled: true,
    items: [
      { id: 'burger', name: 'Burger', price: 120, imageUrl: null, categoryId: 'c1', categoryName: 'Burgers', isAvailable: true, role: 'main' },
      { id: 'fries', name: 'Fries', price: 60, imageUrl: null, categoryId: 'c2', categoryName: 'Sides', isAvailable: true, role: 'side' },
    ],
    combos: [],
    upgrades: [],
    pairings: [],
    lastCall: { enabled: false, title: 'Add to your order', subtitle: '', maxItems: 4, pickedItemIds: [] },
    ideas: [],
    historyOrders: null,
    performance: null,
    ...overrides,
  }
}

const baskets: BasketSummary = {
  dataSource: 'platform',
  isAvailable: true,
  note: null,
  windowLabel: 'last 90 days',
  orderCount: 10,
  itemOrders: { burger: 6, fries: 5 },
  pairs: [{ anchorId: 'fries', partnerId: 'burger', together: 4, share: 0.8, reverseShare: 0.67, support: 0.4, lift: 1.33, strength: 'always' }],
}

const GOOD_ANSWER = JSON.stringify({
  summary: 'Fries ride with burgers.',
  pairings: [{ after: ['i1'], suggest: ['i2'], reason: 'Fries are in 80% of burger orders' }],
})

function deps(overrides: Partial<GenerationDeps> = {}): GenerationDeps & { calls: Record<string, unknown[]> } {
  const calls: Record<string, unknown[]> = { complete: [], fail: [], callModel: [] }
  return {
    calls,
    claim: async () => 'gen-1',
    loadWorkspace: async () => workspace(),
    loadBaskets: async () => baskets,
    callModel: async (messages) => {
      calls.callModel.push(messages)
      return { content: GOOD_ANSWER, model: 'test-model' }
    },
    complete: async (id, result) => { calls.complete.push({ id, result }) },
    fail: async (id, message) => { calls.fail.push({ id, message }) },
    ...overrides,
  }
}

describe('runBoostAiGeneration', () => {
  it('logs validated proposals with where the history came from', async () => {
    // Arrange
    const d = deps()

    // Act
    const outcome = await runBoostAiGeneration(d)

    // Assert
    expect(outcome).toEqual({ status: 'succeeded', generationId: 'gen-1', proposals: 1 })
    expect(d.calls.complete).toHaveLength(1)
    expect(d.calls.complete[0]).toMatchObject({
      id: 'gen-1',
      result: { model: 'test-model', dataSource: 'platform', ordersAnalyzed: 10, summary: 'Fries ride with burgers.' },
    })
    expect(d.calls.fail).toEqual([])
  })

  it('sends the model refs and real counts, never raw ids', async () => {
    const d = deps()

    await runBoostAiGeneration(d)

    const userMessage = (d.calls.callModel[0] as { content: string }[])[1].content
    expect(userMessage).toContain('"ref":"i1"')
    expect(userMessage).toContain('"together":4')
    expect(userMessage).not.toContain('"burger"')
  })

  it('does not call the model once the free generations are used up', async () => {
    const d = deps({ claim: async () => null })

    expect(await runBoostAiGeneration(d)).toEqual({ status: 'quota_exhausted' })
    expect(d.calls.callModel).toEqual([])
  })

  it('gives the slot back when the model answers with nothing usable', async () => {
    const d = deps({ callModel: async () => ({ content: 'Sorry, I cannot help.', model: 'm' }) })

    const outcome = await runBoostAiGeneration(d)

    expect(outcome.status).toBe('failed')
    expect(d.calls.fail).toHaveLength(1)
    expect(d.calls.complete).toEqual([])
  })

  it('gives the slot back when the AI service is down', async () => {
    const d = deps({ callModel: async () => { throw new Error('The AI service did not answer.') } })

    const outcome = await runBoostAiGeneration(d)

    expect(outcome).toEqual({ status: 'failed', error: 'The AI service did not answer.' })
    expect(d.calls.fail).toEqual([{ id: 'gen-1', message: 'The AI service did not answer.' }])
  })

  it('refuses to spend a generation on a menu with nothing available', async () => {
    const empty = workspace({ items: [] })
    const d = deps({ loadWorkspace: async () => empty })

    const outcome = await runBoostAiGeneration(d)

    expect(outcome.status).toBe('failed')
    expect(d.calls.callModel).toEqual([])
    expect(d.calls.fail).toHaveLength(1)
  })

  it('still generates from the menu alone when order history cannot be read', async () => {
    const d = deps({ loadBaskets: async () => ({ ...baskets, isAvailable: false, orderCount: 0, itemOrders: {}, pairs: [], windowLabel: '' }) })

    const outcome = await runBoostAiGeneration(d)

    expect(outcome.status).toBe('succeeded')
    const userMessage = (d.calls.callModel[0] as { content: string }[])[1].content
    expect(userMessage).toContain('no order history available')
  })
})
