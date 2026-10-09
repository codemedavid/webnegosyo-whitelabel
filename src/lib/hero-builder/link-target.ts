// ---------------------------------------------------------------------------
// What a hero link points at. Links are stored as plain href strings (so old
// designs, the save-time schema and the no-JS fallback all keep working), and
// the in-store targets use reserved anchors:
//
//   #storefront-menu      the menu below the hero
//   #category-<id>        one category
//   #product-<id>         one product (opens its detail sheet)
//   #<anchor>             a section of this hero
//   #welcome-start        welcome page: start an order (order type at checkout)
//   #welcome-mode-<mode>  welcome page: start a dine-in / pickup / delivery order
//
// The storefront resolves these through its own menu controller, because most
// menu layouts never render a `#storefront-menu` or `#category-…` element (a
// tabbed layout shows one category at a time) — following the anchor alone
// silently did nothing on them.
// ---------------------------------------------------------------------------

import { safeHref } from './safe-values'
import type { EntryMode } from './types'

export const MENU_ANCHOR = 'storefront-menu'
/** Must match `categorySectionId` in use-category-scroll-spy (pinned by a test). */
export const CATEGORY_ANCHOR_PREFIX = 'category-'
export const PRODUCT_ANCHOR_PREFIX = 'product-'
export const WELCOME_START_ANCHOR = 'welcome-start'
export const WELCOME_MODE_PREFIX = 'welcome-mode-'
export const ENTRY_MODES: readonly EntryMode[] = ['dine_in', 'pickup', 'delivery']

const RECORD_ID = /^[A-Za-z0-9_-]{1,64}$/

export type LinkTarget =
  | { type: 'menu' }
  | { type: 'category'; categoryId: string }
  | { type: 'product'; itemId: string }
  | { type: 'anchor'; anchor: string }
  | { type: 'welcome-start' }
  | { type: 'welcome-mode'; mode: EntryMode }
  | { type: 'url'; href: string }
  | { type: 'none' }

export type InStoreLinkTarget = Exclude<LinkTarget, { type: 'url' } | { type: 'none' }>

function prefixedId(anchor: string, prefix: string): string | null {
  if (!anchor.startsWith(prefix)) return null
  const id = anchor.slice(prefix.length)
  return RECORD_ID.test(id) ? id : null
}

function parseAnchor(raw: string): LinkTarget {
  let anchor: string
  try {
    anchor = decodeURIComponent(raw)
  } catch {
    return { type: 'none' }
  }
  if (!anchor) return { type: 'none' }
  if (anchor === MENU_ANCHOR) return { type: 'menu' }
  if (anchor === WELCOME_START_ANCHOR) return { type: 'welcome-start' }
  if (anchor.startsWith(WELCOME_MODE_PREFIX)) {
    const mode = anchor.slice(WELCOME_MODE_PREFIX.length) as EntryMode
    return ENTRY_MODES.includes(mode) ? { type: 'welcome-mode', mode } : { type: 'none' }
  }
  const categoryId = prefixedId(anchor, CATEGORY_ANCHOR_PREFIX)
  if (categoryId) return { type: 'category', categoryId }
  const itemId = prefixedId(anchor, PRODUCT_ANCHOR_PREFIX)
  if (itemId) return { type: 'product', itemId }
  return { type: 'anchor', anchor }
}

/** Classify a stored href. Unsafe values come back as `none`. */
export function parseLinkTarget(href: unknown): LinkTarget {
  const safe = safeHref(href)
  if (!safe) return { type: 'none' }
  if (safe.startsWith('#')) return parseAnchor(safe.slice(1))
  return { type: 'url', href: safe }
}

/** True for the links that start an order from the welcome page. */
export function isEntryTarget(target: LinkTarget): target is Extract<LinkTarget, { type: 'welcome-start' | 'welcome-mode' }> {
  return target.type === 'welcome-start' || target.type === 'welcome-mode'
}

/** The href to store for a target. */
export function linkTargetHref(target: LinkTarget): string {
  switch (target.type) {
    case 'menu':
      return `#${MENU_ANCHOR}`
    case 'category':
      return `#${CATEGORY_ANCHOR_PREFIX}${target.categoryId}`
    case 'product':
      return `#${PRODUCT_ANCHOR_PREFIX}${target.itemId}`
    case 'anchor':
      return `#${target.anchor}`
    case 'welcome-start':
      return `#${WELCOME_START_ANCHOR}`
    case 'welcome-mode':
      return `#${WELCOME_MODE_PREFIX}${target.mode}`
    case 'url':
      return target.href
    default:
      return ''
  }
}

export function isInStoreTarget(target: LinkTarget): target is InStoreLinkTarget {
  return target.type !== 'url' && target.type !== 'none'
}

/** The DOM id an in-page target scrolls to, or null when it is not a scroll. */
export function targetElementId(target: LinkTarget): string | null {
  switch (target.type) {
    case 'menu':
      return MENU_ANCHOR
    case 'category':
      return `${CATEGORY_ANCHOR_PREFIX}${target.categoryId}`
    case 'anchor':
      return target.anchor
    default:
      return null
  }
}
