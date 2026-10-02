import { planOneTapCreate } from '@/lib/boost/ai/lifecycle'
import { presentBoostAiState, MAX_PRESENTED_PROPOSALS } from '@/lib/boost/ai/present'
import {
  BOOST_AI_CREATE_ACTION,
  boostAiCreatePermissions,
  decideBoostAiAccess,
  parseBoostAiRequest,
} from '@/lib/boost/ai/mobile-request'
import type { BoostAiGeneration, BoostAiLog, BoostAiProposal } from '@/lib/boost/ai/store'
import type { BoostIdea } from '@/lib/boost/ideas'

const TENANT = '11111111-1111-4111-8111-111111111111'
const OTHER_TENANT = '22222222-2222-4222-8222-222222222222'
const PROPOSAL = '33333333-3333-4333-8333-333333333333'

const items = new Map([
  ['burger', { name: 'Burger' }],
  ['fries', { name: 'Fries' }],
  ['coke', { name: 'Coke' }],
  ['burger-meal', { name: 'Burger Meal' }],
])

const combo: BoostIdea = {
  kind: 'combo',
  id: 'c1',
  title: 'Burger Combo',
  reason: 'Fries are in 40% of burger orders.',
  itemIds: ['burger', 'fries', 'coke'],
  name: 'Burger Combo',
  picks: [
    { label: 'Main', itemIds: ['burger'] },
    { label: 'Side', itemIds: ['fries'] },
    { label: 'Drink', itemIds: ['coke'] },
  ],
  regularPrice: 250,
  price: 229,
  savings: { amount: 21, percent: 8 },
}

const upgrade: BoostIdea = {
  kind: 'upgrade',
  id: 'u1',
  title: 'Make it a meal',
  reason: 'Burger is your best seller.',
  itemIds: ['burger', 'burger-meal'],
  sourceId: 'burger',
  targetId: 'burger-meal',
  header: 'Make it a meal?',
  priceDifference: 60,
}

function proposal(id: string, idea: BoostIdea, status: BoostAiProposal['status'], position = 0): BoostAiProposal {
  return {
    id,
    generationId: 'g',
    kind: idea.kind,
    position,
    idea,
    status,
    decidedAt: null,
    appliedAt: null,
    appliedRef: null,
  }
}

function generation(id: string, overrides: Partial<BoostAiGeneration> = {}): BoostAiGeneration {
  return {
    id,
    status: 'succeeded',
    model: 'm',
    dataSource: 'platform',
    ordersAnalyzed: 120,
    summary: 'Burgers drive most orders.',
    error: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    completedAt: '2026-10-01T00:00:30.000Z',
    proposals: [],
    ...overrides,
  }
}

describe('planOneTapCreate', () => {
  it('approves first when the merchant taps Create on a fresh or dismissed idea', () => {
    expect(planOneTapCreate('pending')).toEqual({ ok: true, approveFirst: true })
    expect(planOneTapCreate('rejected')).toEqual({ ok: true, approveFirst: true })
  })

  it('applies an already-approved idea directly', () => {
    expect(planOneTapCreate('approved')).toEqual({ ok: true, approveFirst: false })
  })

  it('refuses an idea that is already live', () => {
    expect(planOneTapCreate('applied')).toEqual({ ok: false, error: 'This offer is already live' })
  })
})

describe('presentBoostAiState', () => {
  it('renders proposals in the merchant’s words with item names, never ids', () => {
    const log: BoostAiLog = {
      used: 1,
      limit: 3,
      generations: [generation('g1', { proposals: [proposal('p1', combo, 'pending'), proposal('p2', upgrade, 'applied', 1)] })],
    }

    const state = presentBoostAiState(log, items, true)

    expect(state.quota).toEqual({ used: 1, limit: 3, left: 2 })
    expect(state.boostEnabled).toBe(true)
    expect(state.latest).toEqual({
      status: 'succeeded',
      summary: 'Burgers drive most orders.',
      ordersAnalyzed: 120,
      createdAt: '2026-10-01T00:00:00.000Z',
      error: null,
    })
    expect(state.proposals).toEqual([
      {
        id: 'p1',
        kind: 'combo',
        status: 'pending',
        title: 'Burger Combo',
        detail: 'Burger + Fries + Coke · ₱229, saves ₱21',
        reason: 'Fries are in 40% of burger orders.',
        itemNames: ['Burger', 'Fries', 'Coke'],
      },
      {
        id: 'p2',
        kind: 'upgrade',
        status: 'applied',
        title: 'Burger → Burger Meal',
        detail: '“Make it a meal?” · +₱60 each time',
        reason: 'Burger is your best seller.',
        itemNames: ['Burger', 'Burger Meal'],
      },
    ])
  })

  it('hides dismissed ideas and failed runs, newest run first', () => {
    const log: BoostAiLog = {
      used: 2,
      limit: 3,
      generations: [
        generation('g3', { status: 'failed', error: 'Model timed out', proposals: [] }),
        generation('g2', { proposals: [proposal('new', upgrade, 'pending')] }),
        generation('g1', { proposals: [proposal('old', combo, 'approved'), proposal('gone', combo, 'rejected', 1)] }),
      ],
    }

    const state = presentBoostAiState(log, items, false)

    expect(state.proposals.map((p) => p.id)).toEqual(['new', 'old'])
    expect(state.latest?.status).toBe('failed')
    expect(state.latest?.error).toBe('Model timed out')
    expect(state.boostEnabled).toBe(false)
  })

  it('drops item names that are no longer on the menu and caps the list', () => {
    const many = Array.from({ length: MAX_PRESENTED_PROPOSALS + 5 }, (_, i) =>
      proposal(`p${i}`, { ...upgrade, itemIds: ['burger', 'deleted'] }, 'pending', i))
    const state = presentBoostAiState({ used: 1, limit: 3, generations: [generation('g', { proposals: many })] }, items, true)

    expect(state.proposals).toHaveLength(MAX_PRESENTED_PROPOSALS)
    expect(state.proposals[0].itemNames).toEqual(['Burger'])
  })

  it('has no latest run before the first generation', () => {
    const state = presentBoostAiState({ used: 0, limit: 3, generations: [] }, items, true)
    expect(state.latest).toBeNull()
    expect(state.proposals).toEqual([])
    expect(state.quota.left).toBe(3)
  })
})

describe('decideBoostAiAccess', () => {
  const owner = { role: 'admin', tenant_id: TENANT, is_owner: true, permissions: [] }

  it('lets the store owner and a superadmin in', () => {
    expect(decideBoostAiAccess(owner, TENANT, 'edit', ['analytics', 'menu'])).toBe(true)
    expect(decideBoostAiAccess({ role: 'superadmin', tenant_id: null }, TENANT, 'edit', ['analytics'])).toBe(true)
  })

  it('refuses another store’s admin', () => {
    expect(decideBoostAiAccess(owner, OTHER_TENANT, 'view', ['analytics'])).toBe(false)
  })

  it('refuses staff without every permission the operation needs', () => {
    const analyst = { role: 'admin', tenant_id: TENANT, is_owner: false, permissions: ['analytics'] }
    expect(decideBoostAiAccess(analyst, TENANT, 'edit', ['analytics'])).toBe(true)
    expect(decideBoostAiAccess(analyst, TENANT, 'create', ['analytics', 'menu'])).toBe(false)
  })

  it('holds creating each offer to the verb and permissions the web write demands', () => {
    expect(BOOST_AI_CREATE_ACTION).toEqual({ combo: 'create', upgrade: 'create', pairing: 'delete', last_call: 'edit' })
    expect(boostAiCreatePermissions('combo')).toEqual(['analytics', 'menu'])
    expect(boostAiCreatePermissions('pairing')).toEqual(['analytics'])
  })

  it('refuses a caller with no app user row', () => {
    expect(decideBoostAiAccess(null, TENANT, 'view', ['analytics'])).toBe(false)
  })
})

describe('parseBoostAiRequest', () => {
  it('accepts each operation the app sends', () => {
    expect(parseBoostAiRequest({ tenantId: TENANT, op: 'state' })).toEqual({ ok: true, value: { tenantId: TENANT, op: 'state' } })
    expect(parseBoostAiRequest({ tenantId: TENANT, op: 'generate' })).toEqual({ ok: true, value: { tenantId: TENANT, op: 'generate' } })
    expect(parseBoostAiRequest({ tenantId: TENANT, op: 'enable' })).toEqual({ ok: true, value: { tenantId: TENANT, op: 'enable' } })
    expect(parseBoostAiRequest({ tenantId: TENANT, op: 'create', proposalId: PROPOSAL }))
      .toEqual({ ok: true, value: { tenantId: TENANT, op: 'create', proposalId: PROPOSAL } })
    expect(parseBoostAiRequest({ tenantId: TENANT, op: 'dismiss', proposalId: PROPOSAL }))
      .toEqual({ ok: true, value: { tenantId: TENANT, op: 'dismiss', proposalId: PROPOSAL } })
  })

  it('refuses a missing proposal id, a bad tenant id and unknown operations', () => {
    expect(parseBoostAiRequest({ tenantId: TENANT, op: 'create' }).ok).toBe(false)
    expect(parseBoostAiRequest({ tenantId: 'nope', op: 'state' }).ok).toBe(false)
    expect(parseBoostAiRequest({ tenantId: TENANT, op: 'delete-everything' }).ok).toBe(false)
    expect(parseBoostAiRequest(null).ok).toBe(false)
  })
})
