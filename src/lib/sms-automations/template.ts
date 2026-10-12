/**
 * Automation messages: which `{{placeholders}}` a recipe may use, and turning
 * a message into one guest's text.
 *
 * Same `{{name}}` shape as the merchant app's campaign renderer
 * (webnegosyo-app/lib/sms/message-template.ts), with the same hard rule: a
 * placeholder that cannot be filled is an error, never a blank. On top of that
 * a placeholder must make sense for the recipe — a win-back guest has no
 * stamp card, so `{{rewardName}}` is only legal in a loyalty recipe.
 *
 * Only the server renders automation texts, so this is the one copy.
 */

import { getRecipe } from './recipes'
import type { Candidate, RecipeId, StoreContext } from './types'

export const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g
export const MISSING_NAME_FALLBACK = 'there'
export const MISSING_FAVORITE_FALLBACK = 'favorites'
/** Three GSM-7 parts. Longer than this costs too much to be a reminder. */
export const MAX_MESSAGE_CHARS = 459

export const BASE_VARIABLES = [
  'firstName', 'name', 'storeName', 'orderCount', 'totalSpent', 'lastOrderDate',
  'daysSinceLastOrder', 'favoriteItem', 'menuLink', 'loyaltyLink', 'reviewLink',
] as const
export const LOYALTY_VARIABLES = ['progressLeft', 'stampsLeft', 'rewardName', 'rewardExpiryDate'] as const

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

function manilaParts(iso: string): { month: string; day: number; year: number } | null {
  const instant = Date.parse(iso)
  if (!Number.isFinite(instant)) return null
  const local = new Date(instant + MANILA_OFFSET_MS)
  return { month: MONTHS[local.getUTCMonth()], day: local.getUTCDate(), year: local.getUTCFullYear() }
}

/**
 * Keeps a filled-in value inside the cheap GSM-7 alphabet. One "₱" or a curly
 * apostrophe copied from a phone keyboard re-encodes the WHOLE text as UCS-2,
 * cutting a part from 160 to 70 characters — the store pays two or three texts
 * for a message that looks identical. Filipino SMS writes pesos as "P50".
 */
export function toSmsSafe(value: string): string {
  return value
    .replace(/₱/g, 'P')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
}

function firstNameOf(name: string | null): string {
  const trimmed = toSmsSafe(name ?? '').trim()
  return trimmed === '' ? MISSING_NAME_FALLBACK : trimmed.split(/\s+/)[0]
}

/** The placeholders a recipe may use. */
export function allowedVariables(recipe: RecipeId): string[] {
  return getRecipe(recipe).needsLoyalty ? [...BASE_VARIABLES, ...LOYALTY_VARIABLES] : [...BASE_VARIABLES]
}

/**
 * Every value one guest's text can draw on. A variable the store cannot fill
 * (no review link) is left OUT, so rendering it fails loudly.
 */
export function buildVariables(
  candidate: Candidate,
  store: StoreContext,
  links: { reviewUrl: string | null },
  now: Date,
): Record<string, string> {
  const { guest, loyalty } = candidate
  const lastOrder = guest.lastOrderAt ? manilaParts(guest.lastOrderAt) : null
  const lastOrderMs = guest.lastOrderAt ? Date.parse(guest.lastOrderAt) : NaN
  const vars: Record<string, string> = {
    firstName: firstNameOf(guest.name),
    name: toSmsSafe(guest.name ?? '').trim() || MISSING_NAME_FALLBACK,
    storeName: toSmsSafe(store.storeName),
    orderCount: String(guest.orderCount),
    totalSpent: String(guest.totalSpent),
    lastOrderDate: lastOrder ? `${lastOrder.month} ${lastOrder.day}, ${lastOrder.year}` : '',
    daysSinceLastOrder: Number.isFinite(lastOrderMs) ? String(Math.max(0, Math.floor((now.getTime() - lastOrderMs) / DAY_MS))) : '',
    favoriteItem: toSmsSafe(guest.favoriteItem ?? '').trim() || MISSING_FAVORITE_FALLBACK,
    menuLink: `${store.baseUrl}/menu`,
    loyaltyLink: `${store.baseUrl}/loyalty`,
  }
  if (links.reviewUrl) vars.reviewLink = links.reviewUrl
  if (loyalty) {
    vars.progressLeft = loyalty.progressLeft
    vars.stampsLeft = String(loyalty.remaining)
    vars.rewardName = loyalty.rewardName
    const expiry = loyalty.rewardExpiresAt ? manilaParts(loyalty.rewardExpiresAt) : null
    if (expiry) vars.rewardExpiryDate = `${expiry.month} ${expiry.day}`
  }
  return vars
}

export class AutomationTemplateError extends Error {
  readonly missing: string[]
  constructor(missing: string[]) {
    super(`This message uses words we cannot fill in: ${missing.join(', ')}`)
    this.name = 'AutomationTemplateError'
    this.missing = missing
  }
}

export function extractVariables(template: string): string[] {
  return [...new Set([...template.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1]))]
}

/** One guest's finished text, opt-out line included. Throws rather than send a blank. */
export function renderAutomationText(
  template: string,
  candidate: Candidate,
  store: StoreContext,
  options: { reviewUrl: string | null; optOutLine: string | null },
  now: Date,
): string {
  const vars = buildVariables(candidate, store, options, now)
  const missing: string[] = []
  const body = template.replace(PLACEHOLDER_PATTERN, (_match, name: string) => {
    const value = vars[name]
    if (value === undefined || value === '') {
      missing.push(name)
      return ''
    }
    return value
  })
  if (missing.length > 0) throw new AutomationTemplateError([...new Set(missing)])
  const trimmed = body.trim()
  const optOut = options.optOutLine?.trim()
  return optOut ? `${trimmed} ${optOut}` : trimmed
}

export type MessageValidation = { ok: true } | { ok: false; error: string }

/** Editor/API guard: refuse a message before it can be saved. */
export function validateAutomationMessage(recipe: RecipeId, template: string): MessageValidation {
  if (template.trim() === '') return { ok: false, error: 'Write a message first.' }
  if (template.length > MAX_MESSAGE_CHARS) {
    return { ok: false, error: `Keep the message under ${MAX_MESSAGE_CHARS} characters (3 texts).` }
  }
  const allowed = new Set(allowedVariables(recipe))
  const unknown = extractVariables(template).filter((name) => !allowed.has(name))
  if (unknown.length > 0) {
    return { ok: false, error: `This automation can’t fill in: ${unknown.map((name) => `{{${name}}}`).join(', ')}` }
  }
  return { ok: true }
}

// --- SMS segment counting (GSM 03.38), mirrored from the app's renderer ------

const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'
const GSM_EXTENDED = '^{}\\[~]|€'
const GSM_BASIC_SET = new Set(GSM_BASIC)
const GSM_EXTENDED_SET = new Set(GSM_EXTENDED)

export interface SmsSegmentCount {
  length: number
  segments: number
  encoding: 'GSM7' | 'UCS2'
}

function segmentsFor(length: number, single: number, multipart: number): number {
  if (length === 0) return 0
  return length <= single ? 1 : Math.ceil(length / multipart)
}

export function countSmsSegments(text: string): SmsSegmentCount {
  let septets = 0
  for (const char of text) {
    if (GSM_BASIC_SET.has(char)) septets += 1
    else if (GSM_EXTENDED_SET.has(char)) septets += 2
    else return { length: text.length, segments: segmentsFor(text.length, 70, 67), encoding: 'UCS2' }
  }
  return { length: septets, segments: segmentsFor(septets, 160, 153), encoding: 'GSM7' }
}
