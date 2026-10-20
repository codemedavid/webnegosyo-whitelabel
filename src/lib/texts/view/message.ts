/**
 * The composer's message rules, in the owner's words: which guest details a
 * campaign can fill, what a text costs (exact GSM-7 / UCS-2 counting, opt-out
 * line included), and the two things that quietly hurt a promo — emoji and
 * links. Pure.
 */

import { countSmsSegments, toSmsSafe } from '@/lib/sms-automations/template'

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g
export const MAX_TEMPLATE_CHARS = 459
const MAX_SEGMENTS = 3
const UCS2_SINGLE = 70
const GSM_SINGLE = 160

/** The details a campaign text can fill (the campaign renderer's variables). */
export const CAMPAIGN_VARIABLES: readonly { key: string; label: string }[] = [
  { key: 'firstName', label: 'First name' },
  { key: 'storeName', label: 'Store name' },
  { key: 'orderCount', label: 'Orders so far' },
  { key: 'lastOrderDate', label: 'Last order date' },
]

/** Also fillable, not offered as chips. */
const EXTRA_VARIABLES = ['name', 'totalSpent']
const KNOWN = new Set([...CAMPAIGN_VARIABLES.map((v) => v.key), ...EXTRA_VARIABLES])

function sampleValues(storeName: string): Record<string, string> {
  return {
    firstName: 'Maria',
    name: 'Maria Santos',
    storeName,
    orderCount: '4',
    totalSpent: '1250',
    lastOrderDate: 'Sep 2, 2026',
  }
}

/** The message as a sample guest reads it, opt-out line on its own line. */
export function renderSample(template: string, storeName: string, optOutLine: string | null): string {
  const values = sampleValues(storeName)
  const body = template.replace(PLACEHOLDER, (match, name: string) => values[name] ?? match).trim()
  const footer = optOutLine?.trim()
  return footer ? `${body}\n${footer}` : body
}

export function unknownVariables(template: string): string[] {
  const unknown: string[] = []
  for (const match of template.matchAll(PLACEHOLDER)) {
    if (!KNOWN.has(match[1]) && !unknown.includes(match[1])) unknown.push(match[1])
  }
  return unknown
}

/** Why this message can't be saved, or null. */
export function messageProblem(template: string): string | null {
  const trimmed = template.trim()
  if (trimmed === '') return 'Write a message first.'
  const unknown = unknownVariables(trimmed)
  if (unknown.length > 0) return `We don't know {{${unknown[0]}}}. Use the chips above.`
  if (trimmed.length > MAX_TEMPLATE_CHARS) return 'Too long: keep it to 3 texts or less.'
  if (/\{\{|\}\}/.test(trimmed.replace(PLACEHOLDER, ''))) return 'A word in {{ }} isn’t finished.'
  return null
}

const LINK = /(https?:\/\/|www\.|\.(?:com|ph|net|org|co|io|me|ly|gl|app|shop|store)\/|\b(?:bit\.ly|tinyurl\.com|goo\.gl|t\.co|ow\.ly|is\.gd|rb\.gy|cutt\.ly|s\.id|shorturl\.at)\b)/i

export function hasLink(text: string): boolean {
  return LINK.test(text)
}

function isPlain(char: string): boolean {
  return countSmsSegments(char).encoding === 'GSM7'
}

/** The first character that turns the text into the expensive encoding. */
export function firstEmoji(text: string): string | null {
  for (const char of toSmsSafe(text)) if (!isPlain(char)) return char
  return null
}

/** Plain letters only: curly quotes and ₱ become their plain twins, emoji go. */
export function removeEmoji(text: string): string {
  const safe = toSmsSafe(text)
  return [...safe].filter(isPlain).join('').replace(/ {2,}/g, ' ').replace(/ +([.,!?])/g, '$1').trim()
}

export interface TextSelection {
  start: number
  end: number
}

/** `{{word}}` at the cursor, with a space before it when glued to a word. */
export function insertVariable(text: string, selection: TextSelection | null, key: string): { text: string; cursor: number } {
  const start = Math.max(0, Math.min(selection?.start ?? text.length, text.length))
  const end = Math.max(start, Math.min(selection?.end ?? text.length, text.length))
  const before = text.slice(0, start)
  const token = `${before.length > 0 && !/\s$/.test(before) ? ' ' : ''}{{${key}}}`
  return { text: `${before}${token}${text.slice(end)}`, cursor: start + token.length }
}

export interface SegmentMeter {
  segments: number
  tone: 'muted' | 'amber' | 'error'
  text: string
  canRemoveEmoji: boolean
}

export function segmentMeter(input: { template: string; storeName: string; optOutLine: string | null; reach: number }): SegmentMeter {
  const rendered = renderSample(input.template, input.storeName, input.optOutLine)
  const count = countSmsSegments(rendered)
  const plain = countSmsSegments(renderSample(removeEmoji(input.template), input.storeName, input.optOutLine))
  const emoji = firstEmoji(input.template)
  const perGuest = (n: number) => `${n} ${n === 1 ? 'text' : 'texts'} per guest`
  if (count.segments > MAX_SEGMENTS || input.template.trim().length > MAX_TEMPLATE_CHARS) {
    return { segments: count.segments, tone: 'error', text: 'Too long: keep it to 3 texts or less.', canRemoveEmoji: emoji !== null }
  }
  if (count.encoding === 'UCS2' && emoji && plain.segments < count.segments) {
    return {
      segments: count.segments,
      tone: 'amber',
      text: `Emoji make this ${perGuest(count.segments)}. Remove ${emoji} to keep it to ${plain.segments}.`,
      canRemoveEmoji: true,
    }
  }
  if (count.segments >= 2) {
    const uses = input.reach > 0 ? ` · uses about ${(input.reach * count.segments).toLocaleString('en-US')} texts from your SIM` : ''
    return { segments: count.segments, tone: 'amber', text: `${perGuest(count.segments)}${uses}`, canRemoveEmoji: false }
  }
  const limit = count.encoding === 'UCS2' ? UCS2_SINGLE : GSM_SINGLE
  return {
    segments: count.segments,
    tone: 'muted',
    text: `${perGuest(Math.max(1, count.segments))} · ${count.length} of ${limit} characters`,
    canRemoveEmoji: false,
  }
}
