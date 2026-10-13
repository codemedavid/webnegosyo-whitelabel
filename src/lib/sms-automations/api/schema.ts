/**
 * The automations API's request contract (POST /api/sms/automations). Pure.
 *
 * One route, one `action` per request, every shape strict: an unknown key is
 * a refusal, not something to ignore. Drafts and texting rules are then
 * normalised here so the app, Owl and the MCP all store the same thing.
 */

import { z } from 'zod'
import { clampParams, getRecipe } from '../recipes'
import { countSmsSegments, validateAutomationMessage } from '../template'
import { AUTOMATION_STATUSES, OUTBOX_STATUSES, RECIPE_IDS, RUN_MODES, type AutomationParams, type RecipeId, type RunMode } from '../types'

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
/** `<created_at ISO>~<id>`: rows queued together share a created_at, so the id breaks the tie. */
export const ACTIVITY_CURSOR = /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})~[0-9a-f-]{36}$/
export const MAX_ACTIVITY_PAGE = 100
const MAX_REVIEW_URL = 300
const MAX_OPT_OUT_LINE = 60

const tenantId = z.uuid()
const knob = z.number().int().min(0).max(365).optional()

const paramsSchema = z.strictObject({
  delayHours: knob,
  delayDays: knob,
  inactiveDays: knob,
  remainingAtMost: knob,
  minOrderCount: knob,
})

const draftSchema = z.strictObject({
  recipe: z.enum(RECIPE_IDS),
  name: z.string().max(80).optional(),
  params: paramsSchema.optional(),
  messageTemplate: z.string().max(2000),
  runMode: z.enum(RUN_MODES).optional(),
  reentryDays: z.number().int().min(1).max(365).nullable().optional(),
})
export type DraftInput = z.infer<typeof draftSchema>

const settingsSchema = z.strictObject({
  quietHoursStart: z.string().regex(HHMM),
  quietHoursEnd: z.string().regex(HHMM),
  guestCapDays: z.number().int().min(1).max(30),
  dailyLimit: z.number().int().min(1).max(500),
  optOutLine: z.string().max(200).nullable(),
  reviewUrl: z.string().max(1000).nullable(),
})
export type SettingsInput = z.infer<typeof settingsSchema>

const requestSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('list'), tenantId }),
  z.strictObject({ action: z.literal('save'), tenantId, automation: draftSchema }),
  z.strictObject({
    action: z.literal('set_status'), tenantId, automationId: z.uuid(), status: z.enum(AUTOMATION_STATUSES),
    /** Turning on: also text the guests who ALREADY qualify (the backlog). */
    sendBacklog: z.boolean().optional(),
  }),
  z.strictObject({ action: z.literal('preview'), tenantId, automation: draftSchema }),
  z.strictObject({ action: z.literal('run_now'), tenantId, automationId: z.uuid() }),
  z.strictObject({ action: z.literal('write'), tenantId, recipe: z.enum(RECIPE_IDS), language: z.enum(['en', 'tl']) }),
  z.strictObject({ action: z.literal('save_settings'), tenantId, settings: settingsSchema }),
  z.strictObject({ action: z.literal('cancel_waiting'), tenantId, automationId: z.uuid().optional() }),
  z.strictObject({
    action: z.literal('activity'), tenantId,
    /** The `nextCursor` of the previous page. */
    cursor: z.string().regex(ACTIVITY_CURSOR).optional(),
    status: z.enum(OUTBOX_STATUSES).optional(),
    automationId: z.uuid().optional(),
    limit: z.number().int().min(1).max(MAX_ACTIVITY_PAGE).optional(),
  }),
])
export type AutomationRequest = z.infer<typeof requestSchema>

export function parseAutomationRequest(body: unknown) {
  return requestSchema.safeParse(body)
}

export interface NormalizedDraft {
  recipe: RecipeId
  name: string
  params: AutomationParams
  messageTemplate: string
  runMode: RunMode
  reentryDays: number | null
}

export type DraftResult = { ok: true; draft: NormalizedDraft } | { ok: false; error: string }

/** Clamp the knobs, default the name, and refuse a message the recipe cannot fill. */
export function normalizeDraft(input: DraftInput): DraftResult {
  const messageTemplate = input.messageTemplate.trim()
  const check = validateAutomationMessage(input.recipe, messageTemplate)
  if (!check.ok) return check
  const name = input.name?.trim() || getRecipe(input.recipe).title
  return {
    ok: true,
    draft: {
      recipe: input.recipe,
      name,
      params: clampParams(input.recipe, input.params ?? {}),
      messageTemplate,
      runMode: input.runMode ?? 'auto',
      reentryDays: input.reentryDays ?? null,
    },
  }
}

export interface NormalizedSettings {
  quietHoursStart: string
  quietHoursEnd: string
  guestCapDays: number
  dailyLimit: number
  optOutLine: string | null
  reviewUrl: string | null
}

export type SettingsResult = { ok: true; settings: NormalizedSettings } | { ok: false; error: string }

function cleanReviewUrl(raw: string | null): { ok: true; value: string | null } | { ok: false } {
  const value = raw?.trim() ?? ''
  if (value === '') return { ok: true, value: null }
  if (value.length > MAX_REVIEW_URL || /\s/.test(value)) return { ok: false }
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname.includes('.') ? { ok: true, value } : { ok: false }
  } catch {
    return { ok: false }
  }
}

/** Same rules as the sms_settings checks, with messages an owner can act on. */
export function normalizeSettings(input: SettingsInput): SettingsResult {
  if (input.quietHoursStart === input.quietHoursEnd) {
    return { ok: false, error: 'Quiet hours need a start and an end that differ.' }
  }
  const review = cleanReviewUrl(input.reviewUrl)
  if (!review.ok) return { ok: false, error: 'Paste the full review link, starting with https://' }
  const optOutLine = input.optOutLine?.trim() || null
  if (optOutLine && optOutLine.length > MAX_OPT_OUT_LINE) {
    return { ok: false, error: `Keep the opt-out line under ${MAX_OPT_OUT_LINE} characters.` }
  }
  if (optOutLine && countSmsSegments(optOutLine).encoding !== 'GSM7') {
    return { ok: false, error: 'Use plain letters in the opt-out line — emoji make every text cost more.' }
  }
  return {
    ok: true,
    settings: {
      quietHoursStart: input.quietHoursStart,
      quietHoursEnd: input.quietHoursEnd,
      guestCapDays: input.guestCapDays,
      dailyLimit: input.dailyLimit,
      optOutLine,
      reviewUrl: review.value,
    },
  }
}
