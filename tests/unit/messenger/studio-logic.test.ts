/**
 * The Studio's pure parts: recipes, the test chat, the preview scenarios and
 * the journey summary. The test chat must answer exactly as the webhook.
 */
import { simulate, type SimEnv } from '@/lib/messenger/chat-simulator'
import { decideReply } from '@/lib/messenger/decide'
import { decodePayload, encodePayload } from '@/lib/messenger/payload'
import { journeySteps } from '@/lib/messenger/journey'
import { DEFAULT_MESSAGE_SETTINGS, MESSAGES } from '@/lib/messenger/messages/registry'
import { readMessages } from '@/lib/messenger/messages/stored'
import { DEFAULT_ORDER_UPDATES } from '@/lib/messenger/order-view'
import { RECIPES, ruleFromRecipe } from '@/lib/messenger/recipes'
import { buildReply } from '@/lib/messenger/replies'
import { DEFAULT_RULES, ruleSchema, type MessengerRule } from '@/lib/messenger/rules'
import { messageTurns, momentTurns, PREVIEW_MOMENTS, type Turn } from '@/lib/messenger/studio-scenarios'
import type { OutgoingMessage } from '@/lib/messenger/graph-message'
import { category, dish, sampleContext, sampleStore } from './sample-store'

const store = sampleStore({
  categories: [category('c1', 'Meals', 1)],
  items: [
    dish('chicken', 'c1', 0, { name: 'Chicken Inasal', price: 149 }),
    dish('pork', 'c1', 1, { name: 'Pork BBQ', price: 99 }),
  ],
})
const env: SimEnv = { store, rules: DEFAULT_RULES, messages: DEFAULT_MESSAGE_SETTINGS, botEnabled: true }

function botTexts(turns: readonly Turn[]): string {
  return turns.flatMap((turn) => (turn.from === 'bot' ? turn.messages : [])).map((message: OutgoingMessage) =>
    message.kind === 'cards' ? message.cards.map((card) => `${card.title} ${card.subtitle ?? ''}`).join(' ') : message.text).join('\n')
}

describe('recipes', () => {
  it.each(RECIPES.map((recipe) => [recipe.id, recipe] as const))('%s makes a valid rule its sample line triggers', (_id, recipe) => {
    const rule = ruleFromRecipe(recipe)
    expect(ruleSchema.safeParse({ ...rule, id: 'r1' }).success).toBe(true)
    const decision = decideReply({ kind: 'text', text: recipe.sample, pageId: 'p', psid: 's', timestamp: 0, dedupeKey: 'k' }, [rule])
    expect(decision?.ruleId).toBe(rule.id)
  })

  it('a recipe hands out a copy (editing the rule never edits the gallery)', () => {
    const rule = ruleFromRecipe(RECIPES[2])
    if (rule.action.kind !== 'text') throw new Error('expected text')
    rule.action.buttons.push({ kind: 'staff', label: 'x' })
    expect(RECIPES[2].action).toMatchObject({ buttons: [{ kind: 'menu' }] })
  })
})

describe('test chat (simulator)', () => {
  it('answers a typed message exactly as the webhook builds it, and names the rule', () => {
    const result = simulate({ kind: 'text', text: 'magkano po' }, [], env)
    expect(result.ruleId).toBe('default-menu')
    expect(result.reply).toEqual(buildReply({ kind: 'menu_card' }, { ...sampleContext(store, null), messages: DEFAULT_MESSAGE_SETTINGS, customerName: '' }))
  })

  it('cart taps change a local cart: add, add, minus, clear', () => {
    const add = { kind: 'tap' as const, title: '🛒 Add to cart', payload: encodePayload({ verb: 'add', itemId: 'chicken' }), isQuickReply: false }
    let result = simulate(add, [], env)
    expect(result.cart).toEqual([{ itemId: 'chicken', qty: 1, name: 'Chicken Inasal' }])
    expect(result.reply[0]).toMatchObject({ text: expect.stringContaining('Added Chicken Inasal') })
    expect(result.ruleId).toBeNull()
    result = simulate(add, result.cart, env)
    expect(result.reply[0]).toMatchObject({ text: expect.stringContaining('(2 in cart)') })
    result = simulate({ kind: 'tap', title: '➖', payload: encodePayload({ verb: 'dec', itemId: 'chicken' }), isQuickReply: false }, result.cart, env)
    expect(result.cart[0].qty).toBe(1)
    result = simulate({ kind: 'tap', title: 'Yes', payload: encodePayload({ verb: 'clear_yes' }), isQuickReply: false }, result.cart, env)
    expect(result.cart).toEqual([])
  })

  it('a quick reply tap follows its payload (category → dishes)', () => {
    const categories = simulate({ kind: 'text', text: 'menu' }, [], { ...env, rules: [{ ...DEFAULT_RULES[2], action: { kind: 'categories' } }] })
    const quick = categories.reply[0].quickReplies?.[0]
    if (!quick) throw new Error('expected a quick reply')
    expect(decodePayload(quick.payload)).toMatchObject({ verb: 'category', categoryId: 'c1' })
    const dishes = simulate({ kind: 'tap', title: quick.title, payload: quick.payload, isQuickReply: true }, [], env)
    expect(dishes.reply.at(-1)).toMatchObject({ kind: 'cards' })
  })

  it('says why it stays quiet', () => {
    expect(simulate({ kind: 'text', text: 'hello' }, [], env).silence).toBe('no_match')
    expect(simulate({ kind: 'text', text: 'menu' }, [], { ...env, botEnabled: false }).silence).toBe('bot_off')
  })

  it('uses the draft wording and the sample name', () => {
    const result = simulate({ kind: 'text', text: 'tao po' }, [], {
      ...env, customerName: 'Ana', messages: readMessages({ 'handover.staff_reply': 'Sige {name}, wait lang!' }),
      rules: [ruleFromRecipe(RECIPES.find((recipe) => recipe.id === 'person')!)],
    })
    expect(result.reply[0]).toMatchObject({ text: 'Sige Ana, wait lang!' })
  })
})

describe('preview scenarios', () => {
  const input = { store, rules: DEFAULT_RULES, messages: readMessages({ lang: 'tl' }), customerName: 'Ana' }

  it.each(PREVIEW_MOMENTS)('%s has a customer turn and a bot answer', (moment) => {
    const turns = momentTurns(moment, input)
    expect(turns.some((turn) => turn.from === 'bot' && turn.messages.length > 0)).toBe(true)
  })

  it.each(MESSAGES.map((entry) => entry.id))('%s: its conversation is not empty', (id) => {
    expect(messageTurns(id, input).some((turn) => turn.from === 'bot' && turn.messages.length > 0)).toBe(true)
  })

  it('shows the edited words where the message goes out', () => {
    const words = { ...input, messages: readMessages({ 'cart.clear_ask': 'Sure ka, {name}?', 'orders.update.ready': 'G na {order}!', 'cart.dropped_many': 'Wala na: {items}' }) }
    expect(botTexts(messageTurns('cart.clear_ask', words))).toContain('Sure ka, Ana?')
    expect(botTexts(messageTurns('orders.update.ready', words))).toContain('G na #07!')
    expect(botTexts(messageTurns('cart.dropped_many', words))).toContain('Wala na: Halo-halo, Leche Flan')
  })
})

describe('journey', () => {
  const base = { rules: DEFAULT_RULES as MessengerRule[], orderUpdates: DEFAULT_ORDER_UPDATES, takeoverMinutes: 60, isPlatformOrders: true }

  it('summarises the built-in set', () => {
    const steps = journeySteps(base)
    expect(steps.map((step) => step.id)).toEqual(['hello', 'browsing', 'cart', 'after', 'handover', 'fallback'])
    expect(steps[0].summary).toBe('Get Started sends menu card')
    expect(steps[3].summary).toBe('Messages when it’s preparing, ready, completed, cancelled')
    expect(steps[4].summary).toContain('waits 1 hour')
    expect(steps[5]).toMatchObject({ isOff: true })
  })

  it('reflects status messages off, other order systems, a fallback and starters', () => {
    const rules: MessengerRule[] = [
      ...DEFAULT_RULES,
      { id: 'f', name: 'Fallback', trigger: { kind: 'fallback' }, action: { kind: 'categories' }, isEnabled: true },
      { id: 'q', name: 'Q', trigger: { kind: 'ice_breaker', question: 'Open today?' }, action: { kind: 'hours_location' }, isEnabled: true },
    ]
    const steps = journeySteps({ ...base, rules, orderUpdates: { ...DEFAULT_ORDER_UPDATES, enabled: false }, takeoverMinutes: 0 })
    expect(steps[0].summary).toContain('1 starter question')
    expect(steps[3]).toMatchObject({ isOff: true })
    expect(steps[4].summary).toContain('keeps answering')
    expect(steps[5]).toMatchObject({ summary: 'Sends pick a category' })
    expect(journeySteps({ ...base, isPlatformOrders: false })[3].summary).toContain('tracking link')
  })
})
