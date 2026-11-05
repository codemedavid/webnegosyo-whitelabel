// Wording for page blocks and text widgets. Always plain strings: tokens are
// a string replace, never HTML.

import { PAGE_BLOCKS } from './blocks'
import type { BlockOption, PageBlockDef } from './types'

type Lookup = Readonly<Record<string, string | undefined>>

const own = (record: Lookup, key: string): string | undefined =>
  Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined

/**
 * A slot's wording: the owner's text on the block, else the store's
 * Branding Studio label it shares, else the built-in fallback. Over-long or
 * blank values fall through (stored designs are untrusted).
 */
export function resolveBlockText(def: PageBlockDef, slotKey: string, texts: Lookup, labels: Lookup): string {
  const slot = def.texts.find((t) => t.key === slotKey)
  if (!slot) return ''
  const fromBlock = own(texts, slotKey)
  if (typeof fromBlock === 'string' && fromBlock.trim() && fromBlock.length <= slot.maxLength) return fromBlock.trim()
  const fromLabel = slot.labelKey ? own(labels, slot.labelKey) : undefined
  if (typeof fromLabel === 'string' && fromLabel.trim()) return fromLabel.trim()
  return slot.fallback
}

/** A block option, falling back to its default when missing or invalid. */
export function resolveBlockOption(def: PageBlockDef, key: string, options: Readonly<Record<string, unknown>>): string | boolean | undefined {
  const option: BlockOption | undefined = def.options.find((o) => o.key === key)
  if (!option) return undefined
  const value = Object.prototype.hasOwnProperty.call(options, key) ? options[key] : undefined
  if (option.type === 'boolean') return typeof value === 'boolean' ? value : option.default
  return typeof value === 'string' && option.choices.some((c) => c.value === value) ? value : option.default
}

const TOKEN = /\{([a-z_]{1,32})\}/gi

/**
 * `{name}`, `{order_number}`… replaced by the page's values. Unknown tokens
 * stay as typed; a known token with no value (a guest without a name) is
 * dropped along with a comma or space before it, so "Hi {name}!" reads "Hi!".
 */
export function applyTokens(text: string, tokens: Lookup): string {
  return text.replace(/([,\s]*)\{([a-z_]{1,32})\}/gi, (match, lead: string, raw: string) => {
    const key = raw.toLowerCase()
    if (!Object.prototype.hasOwnProperty.call(tokens, key)) return match
    const value = tokens[key]
    return value ? `${lead}${value}` : ''
  })
}

/** True when `text` uses a token (so a preview can show sample values). */
export function hasTokens(text: string): boolean {
  TOKEN.lastIndex = 0
  return TOKEN.test(text)
}

/** Every text slot key across all pages that shares a storefront label (for tests). */
export function labelKeysInUse(): string[] {
  return Object.values(PAGE_BLOCKS).flatMap((blocks) => blocks.flatMap((b) => b.texts.map((t) => t.labelKey).filter((k): k is string => !!k)))
}

/** First name only: "Maria Clara Santos" → "Maria". Guests typed anything, keep it short. */
export function firstNameToken(name: unknown): string {
  if (typeof name !== 'string') return ''
  const first = name.trim().split(/\s+/)[0] ?? ''
  return first.slice(0, 40)
}
