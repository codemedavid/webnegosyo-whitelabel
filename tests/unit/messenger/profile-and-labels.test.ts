import { buildMessengerProfile, planProfileSync, profileHash } from '@/lib/messenger/profile'
import { decodePayload } from '@/lib/messenger/payload'
import { describeTrigger, moveRule, newDraftRule } from '@/lib/messenger/rule-labels'
import { ruleSchema, type MessengerRule } from '@/lib/messenger/rules'
import { hashTesterCode, isTesterCodeValid, readTesterCode } from '@/lib/messenger/tester'

const rule = (id: string, trigger: MessengerRule['trigger'], isEnabled = true): MessengerRule => ({
  id, name: id, isEnabled, trigger, action: { kind: 'menu_card' },
})
const ICE = rule('0b0c9d3c-1111-4000-8000-000000000001', { kind: 'ice_breaker', question: 'What are your hours?' })
const MENU_BUTTON = rule('0b0c9d3c-1111-4000-8000-000000000002', { kind: 'menu_button', label: '🍽️ Menu' })

describe('buildMessengerProfile', () => {
  it('nothing to set for keyword-only rules', () => {
    expect(buildMessengerProfile([rule('a', { kind: 'keyword', keywords: ['menu'], match: 'contains' })])).toEqual({})
  })

  it('a persistent menu brings Get Started with it (Meta requires it)', () => {
    const profile = buildMessengerProfile([MENU_BUTTON])
    expect(decodePayload(profile.get_started?.payload ?? '')).toEqual({ verb: 'start' })
    expect(profile.persistent_menu?.[0].call_to_actions).toEqual([{ type: 'postback', title: '🍽️ Menu', payload: `wn1|rule|${MENU_BUTTON.id}` }])
  })

  it('starter questions carry their rule; disabled ones are left out', () => {
    const profile = buildMessengerProfile([ICE, rule('0b0c9d3c-1111-4000-8000-000000000003', { kind: 'ice_breaker', question: 'Off?' }, false)])
    expect(profile.ice_breakers).toEqual([{ locale: 'default', call_to_actions: [{ question: 'What are your hours?', payload: `wn1|rule|${ICE.id}` }] }])
    expect(profile.get_started).toBeUndefined()
  })
})

describe('planProfileSync', () => {
  it('skips an unchanged profile (Meta allows 10 calls per 10 minutes)', () => {
    expect(planProfileSync([ICE], { hash: profileHash(buildMessengerProfile([ICE])), fields: ['ice_breakers'] })).toBeNull()
  })

  it('only removes fields WE set before', () => {
    expect(planProfileSync([], { hash: 'old', fields: ['ice_breakers', 'persistent_menu', 'get_started'] })?.remove)
      .toEqual(['persistent_menu', 'ice_breakers', 'get_started'])
    expect(planProfileSync([], { hash: 'old', fields: [] })?.remove).toEqual([])
    expect(planProfileSync([ICE], { hash: null, fields: [] })).toMatchObject({ remove: [], fields: ['ice_breakers'] })
  })
})

describe('editor helpers', () => {
  it('describeTrigger', () => {
    expect(describeTrigger({ kind: 'keyword', keywords: ['menu', 'price', 'magkano', 'order'], match: 'contains' })).toBe('“menu”, “price”, “magkano” +1 more')
    expect(describeTrigger({ kind: 'keyword', keywords: ['hi'], match: 'exact' })).toBe('Exactly “hi”')
  })

  it('a new draft is valid once it has a word, and its id passes the schema', () => {
    const draft = newDraftRule()
    expect(ruleSchema.safeParse(draft).success).toBe(false)
    const filled = { ...draft, trigger: { kind: 'keyword' as const, keywords: ['menu'], match: 'contains' as const } }
    expect(ruleSchema.safeParse(filled).success).toBe(true)
  })

  it('moveRule never mutates and clamps at the ends', () => {
    const list = ['a', 'b', 'c']
    expect(moveRule(list, 0, 1)).toEqual(['b', 'a', 'c'])
    expect(moveRule(list, 0, -1)).toEqual(['a', 'b', 'c'])
    expect(list).toEqual(['a', 'b', 'c'])
  })
})

describe('tester code', () => {
  const now = new Date('2026-11-10T00:00:00Z')
  const valid = { tenantId: 't1', code: '482193', storedHash: hashTesterCode('t1', '482193'), expiresAt: new Date(now.getTime() + 1000), now }

  it('reads "TEST 482193" in any case and spacing', () => {
    expect(readTesterCode(' test482193 ')).toBe('482193')
    expect(readTesterCode('TEST 4821')).toBeNull()
    expect(readTesterCode('my test 482193')).toBeNull()
  })

  it('checks the code against this store, before it expires', () => {
    expect(isTesterCodeValid(valid)).toBe(true)
    expect(isTesterCodeValid({ ...valid, tenantId: 't2' })).toBe(false)
    expect(isTesterCodeValid({ ...valid, code: '000000' })).toBe(false)
    expect(isTesterCodeValid({ ...valid, expiresAt: now })).toBe(false)
    expect(isTesterCodeValid({ ...valid, storedHash: null })).toBe(false)
  })
})
