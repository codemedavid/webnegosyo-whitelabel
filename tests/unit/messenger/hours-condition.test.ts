/**
 * "Only when: always / store open / store closed" on an automation (plan A5).
 */
import { decideReply, handleEvent, type WebhookDeps } from '@/lib/messenger/handle-event'
import { simulate } from '@/lib/messenger/chat-simulator'
import { journeySteps } from '@/lib/messenger/journey'
import { encodePayload } from '@/lib/messenger/payload'
import { describeTrigger, onceSlot, withWhen } from '@/lib/messenger/rule-labels'
import {
  appliesNow, DEFAULT_RULES, pickOnceRule, pickRuleForText, ruleSchema, ruleSetProblems, triggerSchema,
  type MessengerRule, type RuleTrigger,
} from '@/lib/messenger/rules'
import { DEFAULT_SETTINGS, type StoreBundle } from '@/lib/messenger/settings'
import { DEFAULT_MESSAGE_SETTINGS } from '@/lib/messenger/messages/registry'
import { NOW, sampleStore } from './sample-store'

const rule = (id: string, trigger: RuleTrigger, action: MessengerRule['action'] = { kind: 'menu_card' }, isEnabled = true): MessengerRule =>
  ({ id, name: id, isEnabled, trigger, action })
const keyword = (id: string, words: string[], when?: 'open' | 'closed') =>
  rule(id, { kind: 'keyword', keywords: words, match: 'contains', ...(when ? { when } : {}) })
const closedText = { kind: 'text' as const, text: 'Closed na po kami. Bukas ulit 9 AM!', buttons: [] }

describe('schema', () => {
  it('takes "when" on typed triggers only, and only open/closed', () => {
    expect(triggerSchema.safeParse({ kind: 'keyword', keywords: ['menu'], match: 'contains', when: 'closed' }).success).toBe(true)
    expect(triggerSchema.safeParse({ kind: 'get_started', when: 'open' }).success).toBe(true)
    expect(triggerSchema.safeParse({ kind: 'fallback', when: 'closed' }).success).toBe(true)
    expect(triggerSchema.safeParse({ kind: 'fallback' }).success).toBe(true)
    expect(triggerSchema.safeParse({ kind: 'fallback', when: 'weekends' }).success).toBe(false)
    expect(triggerSchema.safeParse({ kind: 'ice_breaker', question: 'Q?', when: 'open' }).success).toBe(false)
    expect(triggerSchema.safeParse({ kind: 'menu_button', label: 'Menu', when: 'closed' }).success).toBe(false)
  })

  it('every built-in rule stays "always"', () => {
    for (const entry of DEFAULT_RULES) {
      expect(ruleSchema.safeParse(entry).success).toBe(true)
      expect(appliesNow(entry, true) && appliesNow(entry, false)).toBe(true)
    }
  })
})

describe('picking', () => {
  it('a keyword limited to closed answers only while closed; the next match answers while open', () => {
    const rules = [keyword('night', ['menu'], 'closed'), keyword('day', ['menu'])]
    expect(pickRuleForText(rules, 'menu po', false)?.id).toBe('night')
    expect(pickRuleForText(rules, 'menu po', true)?.id).toBe('day')
    expect(pickRuleForText([keyword('night', ['menu'], 'closed')], 'menu', true)).toBeNull()
  })

  it('isOpen defaults to open (callers that do not know the hours)', () => {
    expect(pickRuleForText([keyword('night', ['menu'], 'closed')], 'menu')).toBeNull()
    expect(pickRuleForText([keyword('day', ['menu'], 'open')], 'menu')?.id).toBe('day')
  })

  it('Get Started / fallback: the one for this state beats the always one, in any order', () => {
    const always = rule('always', { kind: 'fallback' })
    const closed = rule('closed', { kind: 'fallback', when: 'closed' })
    expect(pickOnceRule([always, closed], 'fallback', false)?.id).toBe('closed')
    expect(pickOnceRule([always, closed], 'fallback', true)?.id).toBe('always')
    expect(pickOnceRule([closed], 'fallback', true)).toBeNull()
    expect(pickOnceRule([rule('off', { kind: 'fallback', when: 'closed' }, { kind: 'menu_card' }, false), always], 'fallback', false)?.id).toBe('always')
    expect(pickRuleForText([closed, always], 'asdfgh', false)?.id).toBe('closed')
  })

  it('decideReply: Get Started and a referral send the closed greeting at night', () => {
    const rules = [rule('hello', { kind: 'get_started' }), rule('night', { kind: 'get_started', when: 'closed' }, closedText)]
    const start = { kind: 'postback' as const, payload: encodePayload({ verb: 'start' }), title: 'Get Started', pageId: 'p', psid: 's', timestamp: 0, dedupeKey: 'k' }
    expect(decideReply(start, rules, false)?.ruleId).toBe('night')
    expect(decideReply(start, rules, true)?.ruleId).toBe('hello')
    expect(decideReply({ ...start, kind: 'referral', ref: 'ad' }, rules, false)?.ruleId).toBe('night')
    // Limited to open, store closed, no other greeting: still the menu card, never silence.
    const onlyOpen = decideReply(start, [rule('day', { kind: 'get_started', when: 'open' }, closedText)], false)
    expect(onlyOpen?.ruleId).toBeUndefined()
    expect(onlyOpen?.build({ store: sampleStore(), linkToken: null })[0].kind).toBe('cards')
  })
})

describe('rule set', () => {
  it('one Get Started / fallback per "Only when" choice', () => {
    const gs = (id: string, when?: 'open' | 'closed') => rule(id, { kind: 'get_started', ...(when ? { when } : {}) })
    expect(ruleSetProblems([gs('a'), gs('b', 'open'), gs('c', 'closed')])).toEqual([])
    expect(ruleSetProblems([gs('a', 'closed'), gs('b', 'closed')])).toHaveLength(1)
    expect(ruleSetProblems([gs('a'), gs('b')])).toHaveLength(1)
    expect(ruleSetProblems([rule('f1', { kind: 'fallback', when: 'closed' }), rule('f2', { kind: 'fallback', when: 'closed' })])).toHaveLength(1)
  })

  it('labels and slots', () => {
    expect(describeTrigger({ kind: 'keyword', keywords: ['menu'], match: 'contains', when: 'closed' })).toBe('“menu” · only when closed')
    expect(describeTrigger({ kind: 'get_started', when: 'open' })).toBe('Get Started button · only when open')
    expect(describeTrigger({ kind: 'get_started' })).toBe('Get Started button')
    expect(onceSlot('fallback', null)).toBe('fallback:always')
    expect(withWhen({ kind: 'fallback', when: 'closed' }, null)).toEqual({ kind: 'fallback' })
    expect(withWhen({ kind: 'fallback' }, 'open')).toEqual({ kind: 'fallback', when: 'open' })
    expect(withWhen({ kind: 'ice_breaker', question: 'Q?' }, 'open')).toEqual({ kind: 'ice_breaker', question: 'Q?' })
  })

  it('the Journey says what each state sends, and what happens the rest of the day', () => {
    const steps = (rules: MessengerRule[]) => journeySteps({ rules, orderUpdates: { enabled: true, statuses: [], texts: {} }, takeoverMinutes: 60, isPlatformOrders: true })
    const hello = (rules: MessengerRule[]) => steps(rules).find((step) => step.id === 'hello')?.summary
    expect(hello([rule('n', { kind: 'get_started', when: 'closed' }, closedText)])).toBe('Get Started sends your own message · only when closed, else your menu card')
    expect(hello([rule('d', { kind: 'get_started', when: 'open' }), rule('n', { kind: 'get_started', when: 'closed' }, closedText)]))
      .toBe('Get Started sends menu card · only when open, your own message · only when closed')
    const fallback = steps([rule('f', { kind: 'fallback', when: 'closed' }, closedText)]).find((step) => step.id === 'fallback')
    expect(fallback?.summary).toBe('Sends your own message · only when closed, else no answer')
  })
})

describe('store hours', () => {
  // NOW = Tuesday 12:00 in Manila.
  it('open by the store\'s own hours, whatever "enforce hours" or pre-launch say', () => {
    expect(sampleStore().isOpenNow).toBe(true)
    expect(sampleStore({ tenant: { operating_hours: { 2: { closed: false, open: '13:00', close: '21:00' } } } }).isOpenNow).toBe(false)
    expect(sampleStore({ tenant: { operating_hours: { 2: { closed: true, open: '09:00', close: '21:00' } } } }).isOpenNow).toBe(false)
    expect(sampleStore({ tenant: { operating_hours: { 2: { closed: false, open: '13:00', close: '21:00' } }, enforce_operating_hours: false, is_prelaunch: true } }).isOpenNow).toBe(false)
  })

  it('no hours set = open', () => {
    expect(sampleStore({ tenant: { operating_hours: null } }).isOpenNow).toBe(true)
  })
})

describe('webhook + simulator', () => {
  const closedStore = sampleStore({ tenant: { operating_hours: { 2: { closed: false, open: '13:00', close: '21:00' } } } })
  const rules = [keyword('night', ['menu'], 'closed'), ...DEFAULT_RULES]

  it('the webhook answers with the closed automation while the store is closed', async () => {
    const sent: unknown[] = []
    const bundle: StoreBundle = { tenantId: 't', slug: 's', facebookPageRowId: 'r', isPlatformOrders: true, store: closedStore, rules: [rule('night', { kind: 'keyword', keywords: ['menu'], match: 'contains', when: 'closed' }, closedText), ...DEFAULT_RULES], settings: DEFAULT_SETTINGS }
    const deps = {
      ourAppId: 'app', botMetadata: 'wn', now: () => NOW, claimOnce: async () => true,
      findPage: async () => ({ tenantId: 't', token: 'tok' }), loadBundle: async () => bundle, loadTakeoverMinutes: async () => 60,
      allowTesterAttempt: async () => true,
      touchSession: async () => ({ id: '0b0c9d3c-1111-4000-8000-000000000001', botPausedUntil: null, firstName: null, profileFetchedAt: NOW }),
      setBotPause: async () => true,
      send: async (_token: string, _psid: string, messages: readonly unknown[]) => { sent.push(messages); return { ok: true, sent: messages.length } },
      answerOrderReferral: async () => ({ outcome: 'sent' as const }), createLinkToken: () => 'mt1.T', linkTester: async () => true,
      changeCart: async () => null, loadRecentOrders: async () => [], logChat: async () => {}, refreshProfile: async () => null,
    } as unknown as WebhookDeps
    expect(await handleEvent({ pageId: 'p', psid: 's', timestamp: 1, dedupeKey: 'mid:1', kind: 'text', text: 'menu po' }, deps)).toBe('replied')
    expect(JSON.stringify(sent)).toContain('Closed na po kami')
  })

  it('the Test chat follows the store\'s hours, and the Open / Closed switch overrides them', () => {
    const env = { store: closedStore, rules, messages: DEFAULT_MESSAGE_SETTINGS, botEnabled: true }
    expect(simulate({ kind: 'text', text: 'menu' }, [], env).ruleId).toBe('night')
    expect(simulate({ kind: 'text', text: 'menu' }, [], { ...env, isOpen: true }).ruleId).not.toBe('night')
    expect(simulate({ kind: 'text', text: 'menu' }, [], { ...env, store: sampleStore() }).ruleId).not.toBe('night')
  })
})
