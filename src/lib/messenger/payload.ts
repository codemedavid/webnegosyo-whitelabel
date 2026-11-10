/**
 * Postback and quick-reply payloads: `wn1|<verb>|<arg>|…`.
 *
 * Not signed, on purpose: a payload can only come from a button we sent,
 * inside a webhook whose signature was already checked, and every id it
 * carries is re-checked against the store the Page belongs to before use.
 * Anything that does not decode is ignored — another tool on the same Page
 * (a chatbot, Page Inbox's own buttons) uses its own payloads.
 */

const PREFIX = 'wn1'
const SEPARATOR = '|'
/** UUIDs and other row ids: never the separator, never long. */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const MAX_PAGE = 50

export type MessengerPayload =
  /** The Get Started button. */
  | { verb: 'start' }
  /** An ice breaker or persistent-menu entry: run that rule's action. */
  | { verb: 'rule'; ruleId: string }
  | { verb: 'menu' }
  | { verb: 'categories' }
  /** One category's dishes, `page` 0-based. */
  | { verb: 'category'; categoryId: string; page: number }
  | { verb: 'staff' }
  /** Chat cart (release 2): add / + / − / remove one dish. */
  | { verb: 'add' | 'inc' | 'dec' | 'rm'; itemId: string }
  | { verb: 'cart' }
  /** "Empty cart" asks first; `clear_yes` is the confirmation. */
  | { verb: 'clear' }
  | { verb: 'clear_yes' }
  /** This customer's recent orders. */
  | { verb: 'orders' }

export function encodePayload(payload: MessengerPayload): string {
  switch (payload.verb) {
    case 'start':
    case 'menu':
    case 'categories':
    case 'staff':
    case 'cart':
    case 'clear':
    case 'clear_yes':
    case 'orders':
      return [PREFIX, payload.verb].join(SEPARATOR)
    case 'add':
    case 'inc':
    case 'dec':
    case 'rm':
      return [PREFIX, payload.verb, payload.itemId].join(SEPARATOR)
    case 'rule':
      return [PREFIX, 'rule', payload.ruleId].join(SEPARATOR)
    case 'category':
      return [PREFIX, 'cat', payload.categoryId, String(payload.page)].join(SEPARATOR)
  }
}

function readId(value: string | undefined): string | null {
  return value && ID_PATTERN.test(value) ? value : null
}

function readPage(value: string | undefined): number | null {
  if (value === undefined || !/^\d{1,2}$/.test(value)) return null
  const page = Number(value)
  return page <= MAX_PAGE ? page : null
}

export function decodePayload(raw: string): MessengerPayload | null {
  const parts = raw.split(SEPARATOR)
  if (parts[0] !== PREFIX) return null
  const [, verb, first, second] = parts

  switch (verb) {
    case 'start':
    case 'menu':
    case 'categories':
    case 'staff':
    case 'cart':
    case 'clear':
    case 'clear_yes':
    case 'orders':
      return parts.length === 2 ? { verb } : null
    case 'add':
    case 'inc':
    case 'dec':
    case 'rm': {
      const itemId = readId(first)
      return itemId && parts.length === 3 ? { verb, itemId } : null
    }
    case 'rule': {
      const ruleId = readId(first)
      return ruleId && parts.length === 3 ? { verb: 'rule', ruleId } : null
    }
    case 'cat': {
      const categoryId = readId(first)
      const page = readPage(second)
      return categoryId && page !== null && parts.length === 4 ? { verb: 'category', categoryId, page } : null
    }
    default:
      return null
  }
}
