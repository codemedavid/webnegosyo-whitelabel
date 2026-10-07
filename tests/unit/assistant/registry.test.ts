import { z } from 'zod'
import { availableTools, factsForModel, type AssistantToolDef } from '@/lib/assistant/tools/registry'

const flags = { inventoryEnabled: false, customerHubOn: true, menuEngineeringEnabled: true }

function def(name: string, access: AssistantToolDef['access'], isAvailable?: AssistantToolDef['isAvailable']): AssistantToolDef {
  return { name, description: name, access, isAvailable, input: z.object({}), run: async () => ({ facts: {} }) }
}

const DEFS = [
  def('sales', { permission: 'analytics' }),
  def('staff', { ownerOnly: true }),
  def('inventory', { permission: 'menu' }, (f) => f.inventoryEnabled),
]

describe('availableTools', () => {
  test('a cashier with only POS access is offered nothing', () => {
    const tools = availableTools(DEFS, { role: 'admin', is_owner: false, permissions: ['pos'] }, flags)

    expect(tools.map((t) => t.name)).toEqual([])
  })

  test('staff with analytics see sales but never the owner-only staff tool', () => {
    const tools = availableTools(DEFS, { role: 'admin', is_owner: false, permissions: ['analytics', 'menu'] }, flags)

    expect(tools.map((t) => t.name)).toEqual(['sales'])
  })

  test('the owner sees every tool whose store feature is on, in registry order', () => {
    const tools = availableTools(DEFS, { role: 'admin', is_owner: true, permissions: null }, { ...flags, inventoryEnabled: true })

    expect(tools.map((t) => t.name)).toEqual(['sales', 'staff', 'inventory'])
  })
})

describe('factsForModel', () => {
  test('scrubs any raw uuid a tool forgot to turn into a ref', () => {
    const facts = factsForModel({ facts: { item: 'Sisig 6f1c2b0e-0000-4000-8000-000000000001', nested: [{ id: '6f1c2b0e-0000-4000-8000-000000000002' }] } })

    expect(JSON.stringify(facts)).not.toMatch(/6f1c2b0e/)
  })

  test('trims an oversized payload and says so', () => {
    const rows = Array.from({ length: 400 }, (_, i) => ({ name: `Item number ${i}`, units: i }))

    const facts = factsForModel({ facts: { rows } })

    expect((facts.rows as unknown[]).length).toBeLessThanOrEqual(8)
    expect(facts.truncated).toBe(true)
  })

  test('never includes the card or chips', () => {
    const facts = factsForModel({ facts: { a: 1 }, card: { type: 'stats', title: 't', items: [] }, chips: [{ label: 'x', prompt: 'y' }] })

    expect(facts).toEqual({ a: 1 })
  })
})
