/**
 * Campaign messages. Pure.
 *
 * Exactly the merchant app's campaign placeholders
 * (webnegosyo-app/lib/sms/message-template.ts) — the composer's chips. The
 * values come from the automation renderer (`buildVariables` in
 * sms-automations/template.ts), so a guest-typed name is cleaned the same way
 * for every server-sent text — it can never smuggle a link or a number into
 * the store's own SIM. A value that cannot be filled is a refusal (null), never
 * a blank: "Hi , we miss you" to hundreds of guests is the failure to avoid.
 */

import { MAX_BODY_CHARS } from '@/lib/sms-automations/planner'
import {
  MAX_MESSAGE_CHARS, PLACEHOLDER_PATTERN, buildVariables, countSmsSegments, extractVariables,
} from '@/lib/sms-automations/template'
import type { Candidate } from '@/lib/sms-automations/types'
import type { SmsCustomer } from './audience'

export const CAMPAIGN_VARIABLES = [
  'firstName', 'name', 'storeName', 'orderCount', 'totalSpent', 'lastOrderDate',
] as const
export type CampaignVariable = (typeof CAMPAIGN_VARIABLES)[number]

/** A promo longer than three texts costs too much; the composer blocks it. */
export const MAX_CAMPAIGN_SEGMENTS = 3

const ALLOWED: ReadonlySet<string> = new Set(CAMPAIGN_VARIABLES)
/** `buildVariables` needs a store address for link variables; campaigns never use them. */
const NO_LINKS_BASE_URL = 'https://invalid.example'
const FAR_FUTURE = '9999-12-31T00:00:00.000Z'

export interface CampaignStore {
  storeName: string
}

export interface CampaignTextRules {
  optOutLine: string | null
}

function candidateOf(guest: SmsCustomer): Candidate {
  return {
    guest: {
      id: guest.id,
      name: guest.name,
      phone: guest.phone_e164,
      smsConsent: guest.sms_consent,
      smsOptOut: guest.sms_opt_out,
      orderCount: guest.order_count,
      totalSpent: guest.total_spent,
      firstOrderAt: null,
      lastOrderAt: guest.last_order_at,
      favoriteItem: null,
    },
    occurrenceKey: 'campaign',
    dueAt: FAR_FUTURE,
    expiresAt: FAR_FUTURE,
  }
}

/** One guest's finished text (opt-out line included), or null when it cannot be filled or would not fit. */
export function renderCampaignMessage(
  template: string, guest: SmsCustomer, store: CampaignStore, rules: CampaignTextRules,
): string | null {
  const vars = buildVariables(candidateOf(guest), { tenantId: '', storeName: store.storeName, baseUrl: NO_LINKS_BASE_URL }, { reviewUrl: null }, new Date(0))
  let isMissing = false
  const body = template.replace(PLACEHOLDER_PATTERN, (_match, name: string) => {
    const value = ALLOWED.has(name) ? vars[name] : undefined
    if (value === undefined || value === '') isMissing = true
    return value ?? ''
  }).trim()
  if (isMissing || body === '') return null
  const optOut = rules.optOutLine?.trim()
  const text = optOut ? `${body} ${optOut}` : body
  return text.length > MAX_BODY_CHARS ? null : text
}

export type TemplateCheck = { ok: true } | { ok: false; error: string }

/** The composer's and the server's refusal of a message before it can be saved or sent. */
export function validateCampaignTemplate(template: string): TemplateCheck {
  if (template.trim() === '') return { ok: false, error: 'Write a message first.' }
  if (template.length > MAX_MESSAGE_CHARS) {
    return { ok: false, error: `Keep the message under ${MAX_MESSAGE_CHARS} characters (3 texts).` }
  }
  const unknown = extractVariables(template).filter((name) => !ALLOWED.has(name))
  if (unknown.length > 0) {
    return { ok: false, error: `We don't know ${unknown.map((name) => `{{${name}}}`).join(', ')}. Use the chips above.` }
  }
  return { ok: true }
}

/** A typical guest, for counting texts before anyone is picked ("Preview as" falls back to it). */
export const SAMPLE_GUEST: SmsCustomer = Object.freeze({
  id: 'sample',
  name: 'Maria Santos',
  phone_e164: '+639170000000',
  order_count: 12,
  total_spent: 4500,
  last_order_at: '2026-10-12T02:00:00.000Z',
  channels_used: [],
  sms_consent: true,
  sms_opt_out: false,
}) as SmsCustomer

/** Texts per guest for this message with the opt-out line, using the sample guest. */
export function estimateCampaignSegments(template: string, optOutLine: string | null): number {
  const body = renderCampaignMessage(template, SAMPLE_GUEST, { storeName: 'Your Store' }, { optOutLine })
  const text = body ?? `${template.trim()} ${optOutLine?.trim() ?? ''}`.trim()
  return countSmsSegments(text).segments
}
