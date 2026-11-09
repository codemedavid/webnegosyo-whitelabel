/**
 * Every action over awkward menus stays inside Meta's limits. A message over a
 * limit is refused whole by the Send API, so the customer would get nothing.
 */
import { buildCategoryItems, buildReply } from '@/lib/messenger/replies'
import { charLength, MESSENGER_LIMITS as L } from '@/lib/messenger/limits'
import type { OutgoingMessage } from '@/lib/messenger/graph-message'
import { ACTION_KINDS, type RuleAction } from '@/lib/messenger/rules'
import { category, dish, sampleContext, sampleStore } from './sample-store'

const LONG = '🍗 Extra-Large Family Bucket of Our Famous Garlic Butter Chicken Wings with Java Rice and Gravy '.repeat(3)

const awkward = sampleStore({
  tenant: { name: `${LONG} Restaurant`, restaurant_address: LONG },
  categories: Array.from({ length: 30 }, (_, index) => category(`c${index}`, `${LONG} ${index}`, index)),
  items: Array.from({ length: 30 * 15 }, (_, index) =>
    dish(`d${index}`, `c${index % 30}`, index, { name: `${LONG}${index}`, description: LONG, price: 123456.75, discounted_price: 99999.5 })),
})

const ACTIONS: Record<(typeof ACTION_KINDS)[number], RuleAction> = {
  menu_card: { kind: 'menu_card', title: 'x'.repeat(80), subtitle: 'y'.repeat(80), buttonLabel: 'z'.repeat(20) },
  categories: { kind: 'categories', text: 'Pick one {store}' },
  category_items: { kind: 'category_items', categoryId: 'c0', text: '{store} {menu_link}' },
  featured_items: { kind: 'featured_items', itemIds: [] },
  text: { kind: 'text', text: `${'w'.repeat(590)} {store}`, buttons: [{ kind: 'menu', label: 'Menu' }, { kind: 'categories', label: 'Cats' }, { kind: 'staff', label: 'Staff' }] },
  hours_location: { kind: 'hours_location' },
  talk_to_staff: { kind: 'talk_to_staff', text: '{store} '.repeat(60) },
  order_status: { kind: 'order_status' },
}

function problems(message: OutgoingMessage): string[] {
  const found: string[] = []
  const check = (ok: boolean, what: string) => { if (!ok) found.push(what) }
  const buttons = message.kind === 'buttons' ? message.buttons : message.kind === 'cards' ? message.cards.flatMap((card) => card.buttons) : []
  for (const button of buttons) {
    check(charLength(button.title) <= L.buttonTitle, `button title ${button.title}`)
    if (button.type === 'postback') check(button.payload.length <= L.payload, 'postback payload')
    if (button.type === 'web_url') check(button.url.startsWith('https://'), 'https button url')
  }
  for (const reply of message.quickReplies ?? []) {
    check(charLength(reply.title) <= L.quickReplyTitle, `quick reply ${reply.title}`)
    check(reply.payload.length <= L.payload, 'quick reply payload')
  }
  check((message.quickReplies?.length ?? 0) <= L.quickReplies, 'quick reply count')
  if (message.kind === 'text') check(charLength(message.text) <= L.text && message.text.length > 0, 'text length')
  if (message.kind === 'buttons') {
    check(charLength(message.text) <= L.buttonTemplateText && message.text.length > 0, 'button template text')
    check(message.buttons.length >= 1 && message.buttons.length <= L.cardButtons, 'button count')
  }
  if (message.kind === 'cards') {
    check(message.cards.length >= 1 && message.cards.length <= L.cardElements, 'card count')
    for (const card of message.cards) {
      check(charLength(card.title) <= L.cardTitle && card.title.length > 0, 'card title')
      check(!card.subtitle || charLength(card.subtitle) <= L.cardSubtitle, 'card subtitle')
      check(card.buttons.length <= L.cardButtons, 'card buttons')
      check(!card.imageUrl || card.imageUrl.startsWith('https://'), 'card image')
    }
  }
  return found
}

describe('every reply fits Meta\'s limits', () => {
  for (const store of [awkward, sampleStore(), sampleStore({ items: [] })]) {
    for (const kind of ACTION_KINDS) {
      it(`${kind} on a ${store.items.length}-dish store`, () => {
        for (const message of buildReply(ACTIONS[kind], sampleContext(store, 'mt1.1.' + 'a'.repeat(80)))) {
          expect(problems(message)).toEqual([])
        }
      })
    }
  }

  it('every page of a long category', () => {
    for (let page = 0; page < 3; page += 1) {
      for (const message of buildCategoryItems(sampleContext(awkward), 'c1', page)) expect(problems(message)).toEqual([])
    }
  })
})
