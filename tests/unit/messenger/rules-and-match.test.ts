import { matchesKeyword, normalizeForMatch } from '@/lib/messenger/match'
import {
  actionSchema,
  DEFAULT_RULES,
  parseStoredRules,
  pickRuleForText,
  ruleSchema,
  ruleSetProblems,
  type MessengerRule,
} from '@/lib/messenger/rules'
import { decodePayload, encodePayload, type MessengerPayload } from '@/lib/messenger/payload'

describe('normalizeForMatch', () => {
  it.each([
    ['MENU po!!', 'menu'],
    ['  Magkano   po ang  Sisig? ', 'magkano po ang sisig'],
    ['Café crème', 'cafe creme'],
    ['/menu', 'menu'],
    ['po', 'po'],
  ])('%p → %p', (input, expected) => {
    expect(normalizeForMatch(input)).toBe(expected)
  })
})

describe('matchesKeyword', () => {
  it('matches whole words only', () => {
    expect(matchesKeyword('can I see the menu?', 'menu', 'contains')).toBe(true)
    expect(matchesKeyword('itemize this', 'item', 'contains')).toBe(false)
    expect(matchesKeyword('send me your items', 'item', 'contains')).toBe(false)
  })

  it('matches phrases across punctuation', () => {
    expect(matchesKeyword('Hi! Where is my order??', 'where is my order', 'contains')).toBe(true)
  })

  it('exact needs the whole message', () => {
    expect(matchesKeyword('Menu po', 'menu', 'exact')).toBe(true)
    expect(matchesKeyword('menu please and prices', 'menu', 'exact')).toBe(false)
  })

  it('never matches an empty keyword', () => {
    expect(matchesKeyword('anything', '  !! ', 'contains')).toBe(false)
  })
})

describe('default rules keep the pre-2026-11-10 webhook behaviour', () => {
  const rules = [...DEFAULT_RULES]

  it.each([
    'menu', 'Can I see your products?', 'what do you have', 'i want to order', 'prices po', 'MAGKANO po?', 'ano meron kayo',
  ])('%p gets the menu card', (text) => {
    expect(pickRuleForText(rules, text)?.action.kind).toBe('menu_card')
  })

  it.each([
    'where is my order', 'Order status pls', 'asan na order ko', 'my order menu',
  ])('%p asks about an order (never a menu card)', (text) => {
    expect(pickRuleForText(rules, text)?.action.kind).toBe('order_status')
  })

  it('a new order in Filipino is not a status question', () => {
    expect(pickRuleForText(rules, 'pa order ko ng 2 sisig')?.action.kind).toBe('menu_card')
  })

  it('small talk matches nothing (no fallback by default)', () => {
    expect(pickRuleForText(rules, 'thank you!')).toBeNull()
  })

  it('every default rule validates', () => {
    for (const rule of DEFAULT_RULES) expect(ruleSchema.safeParse(rule).success).toBe(true)
  })
})

describe('pickRuleForText', () => {
  const keyword = (id: string, words: string[], enabled = true): MessengerRule => ({
    id, name: id, isEnabled: enabled, trigger: { kind: 'keyword', keywords: words, match: 'contains' }, action: { kind: 'menu_card' },
  })
  const fallback: MessengerRule = { id: 'fb', name: 'fb', isEnabled: true, trigger: { kind: 'fallback' }, action: { kind: 'talk_to_staff' } }

  it('first match in order wins', () => {
    expect(pickRuleForText([keyword('a', ['hours']), keyword('b', ['hours'])], 'your hours?')?.id).toBe('a')
  })

  it('skips disabled rules', () => {
    expect(pickRuleForText([keyword('a', ['hours'], false), keyword('b', ['hours'])], 'hours')?.id).toBe('b')
  })

  it('falls back only when nothing matched', () => {
    expect(pickRuleForText([fallback, keyword('a', ['hours'])], 'hours')?.id).toBe('a')
    expect(pickRuleForText([fallback, keyword('a', ['hours'])], 'hello')?.id).toBe('fb')
  })
})

describe('rule schemas', () => {
  it('refuses http links and unknown keys', () => {
    expect(actionSchema.safeParse({ kind: 'text', text: 'Hi', buttons: [{ kind: 'link', label: 'Go', url: 'http://x.com' }] }).success).toBe(false)
    expect(actionSchema.safeParse({ kind: 'menu_card', html: '<b>' }).success).toBe(false)
  })

  it('refuses button labels Meta would cut', () => {
    expect(actionSchema.safeParse({ kind: 'text', text: 'Hi', buttons: [{ kind: 'menu', label: 'x'.repeat(21) }] }).success).toBe(false)
  })

  it('drops stored rows that no longer validate', () => {
    expect(parseStoredRules([DEFAULT_RULES[0], { id: 'bad', name: 'x', trigger: { kind: 'nope' } }])).toHaveLength(1)
  })

  it('ruleSetProblems counts what Meta caps', () => {
    const ice = (id: string): MessengerRule => ({ id, name: id, isEnabled: true, trigger: { kind: 'ice_breaker', question: 'Q?' }, action: { kind: 'menu_card' } })
    expect(ruleSetProblems(['1', '2', '3', '4'].map(ice))).toEqual([])
    expect(ruleSetProblems(['1', '2', '3', '4', '5'].map(ice))).toHaveLength(1)
    expect(ruleSetProblems([ice('1'), ice('1')])).toEqual(['Two automations share an id.'])
  })
})

describe('payload codec', () => {
  const cases: MessengerPayload[] = [
    { verb: 'start' }, { verb: 'menu' }, { verb: 'categories' }, { verb: 'staff' },
    { verb: 'rule', ruleId: '0b0c9d3c-1111-4000-8000-000000000001' },
    { verb: 'category', categoryId: 'c-big', page: 3 },
  ]

  it.each(cases)('round-trips %p', (payload) => {
    expect(decodePayload(encodePayload(payload))).toEqual(payload)
  })

  it.each([
    'GET_STARTED', 'wn1', 'wn1|start|extra', 'wn1|cat|c1', 'wn1|cat|c1|99', 'wn1|cat|bad id|0', 'wn1|rule|', 'wn1|rule|a|b', 'wn2|menu',
  ])('ignores %p', (raw) => {
    expect(decodePayload(raw)).toBeNull()
  })
})
