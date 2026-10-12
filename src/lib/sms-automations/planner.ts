/**
 * The planner: from "who qualifies" to "who gets a text now". Pure.
 *
 * Every guest-protecting rule lives here, in this order:
 *   1. a phone, consent, not opted out, not suppressed (always — not an option);
 *   2. the store can fill the message (review link set, every word fillable);
 *   3. one text per occurrence, shared across a recipe family;
 *   4. a re-entry gap per family;
 *   5. ONE automated text per guest every `guestCapDays` across ALL
 *      automations — the highest-priority recipe wins, a text still waiting on
 *      the phone counts;
 * and then quiet hours HOLD the text (`not_before`), they never drop it.
 *
 * The send-time SQL re-checks consent, the cap and the exit conditions, because
 * a text can wait hours for a phone. This pass decides; that one confirms.
 */

import { nextSendableAt } from './quiet-hours'
import { getRecipe } from './recipes'
import { AutomationTemplateError, renderAutomationText } from './template'
import type {
  AutomationRow, AutomationSettings, Candidate, HistoryRow, OutboxDraft, SkipReason, StoreContext,
} from './types'

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
/** A queued text that no phone sent within a week is stale, whatever its moment. */
const MAX_QUEUE_DAYS = 7
const SAMPLE_SIZE = 5

export type PlanMode = 'fresh' | 'all'

export interface PlanInput {
  now: Date
  /** `fresh` = the automatic tick; `all` = Run now / "text the ones who already qualify". */
  mode: PlanMode
  store: StoreContext
  settings: AutomationSettings
  suppressedPhones: ReadonlySet<string>
  /** Earlier outbox rows of this store, newest window that any rule needs. */
  history: readonly HistoryRow[]
  work: readonly { automation: AutomationRow; candidates: readonly Candidate[] }[]
}

export interface AutomationReport {
  qualifying: number
  queued: number
  skipped: Partial<Record<SkipReason, number>>
  /** First few guests who will get a text, masked ("Maria S."). */
  sample: string[]
}

export interface PlanResult {
  drafts: OutboxDraft[]
  reports: Map<string, AutomationReport>
}

const PENDING: ReadonlySet<HistoryRow['status']> = new Set(['queued', 'claimed'])
const DELIVERED_OR_PENDING: ReadonlySet<HistoryRow['status']> = new Set(['queued', 'claimed', 'sent'])

export function maskGuestName(name: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'Guest'
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`
}

function familyOf(recipe: HistoryRow['recipe']): string {
  return getRecipe(recipe).family
}

interface HistoryIndex {
  occurrences: Set<string>
  /** family|customer -> newest created_at (ms) of a delivered-or-pending text. */
  lastInFamily: Map<string, number>
  /** phone -> the guest is capped (pending text, or one sent inside the cap). */
  cappedPhones: Set<string>
}

function indexHistory(history: readonly HistoryRow[], now: Date, capDays: number): HistoryIndex {
  const occurrences = new Set<string>()
  const lastInFamily = new Map<string, number>()
  const cappedPhones = new Set<string>()
  const capStart = now.getTime() - capDays * DAY_MS
  for (const row of history) {
    const family = familyOf(row.recipe)
    if (row.customer_id) occurrences.add(`${family}|${row.customer_id}|${row.occurrence_key}`)
    if (row.customer_id && DELIVERED_OR_PENDING.has(row.status)) {
      const key = `${family}|${row.customer_id}`
      lastInFamily.set(key, Math.max(lastInFamily.get(key) ?? 0, Date.parse(row.created_at)))
    }
    if (PENDING.has(row.status)) cappedPhones.add(row.phone_e164)
    if (row.status === 'sent' && row.sent_at && Date.parse(row.sent_at) >= capStart) cappedPhones.add(row.phone_e164)
  }
  return { occurrences, lastInFamily, cappedPhones }
}

function emptyReport(): AutomationReport {
  return { qualifying: 0, queued: 0, skipped: {}, sample: [] }
}

function inMode(candidate: Candidate, automation: AutomationRow, input: PlanInput): boolean {
  const now = input.now.getTime()
  const due = Date.parse(candidate.dueAt)
  if (!(due <= now) || !(Date.parse(candidate.expiresAt) > now)) return false
  if (input.mode === 'all') return true
  return due >= now - getRecipe(automation.recipe).freshWindowHours * HOUR_MS
}

/** Which rule, if any, stops this text. Order matters: it is the reason shown. */
function skipReasonFor(
  automation: AutomationRow, candidate: Candidate, input: PlanInput, index: HistoryIndex, chosen: Set<string>,
): SkipReason | null {
  const { guest } = candidate
  const recipe = getRecipe(automation.recipe)
  if (!guest.phone) return 'no_phone'
  if (!guest.smsConsent) return 'no_consent'
  if (guest.smsOptOut) return 'opted_out'
  if (input.suppressedPhones.has(guest.phone)) return 'suppressed'
  if (recipe.needsReviewLink && !input.settings.reviewUrl) return 'missing_review_link'
  if (index.occurrences.has(`${recipe.family}|${guest.id}|${candidate.occurrenceKey}`)) return 'already_sent'
  const reentryDays = automation.reentry_days ?? recipe.defaultReentryDays
  const last = index.lastInFamily.get(`${recipe.family}|${guest.id}`)
  if (last !== undefined && last >= input.now.getTime() - reentryDays * DAY_MS) return 'too_soon'
  if (index.cappedPhones.has(guest.phone) || chosen.has(guest.phone)) return 'texted_recently'
  return null
}

export function planTexts(input: PlanInput): PlanResult {
  const index = indexHistory(input.history, input.now, input.settings.guestCapDays)
  const reports = new Map<string, AutomationReport>()
  const chosenPhones = new Set<string>()
  const drafts: OutboxDraft[] = []

  const pairs = input.work
    .flatMap(({ automation, candidates }) => {
      reports.set(automation.id, emptyReport())
      return candidates.filter((c) => inMode(c, automation, input)).map((candidate) => ({ automation, candidate }))
    })
    .sort((a, b) =>
      getRecipe(a.automation.recipe).priority - getRecipe(b.automation.recipe).priority
      || Date.parse(a.candidate.dueAt) - Date.parse(b.candidate.dueAt))

  const notBefore = nextSendableAt(input.now, input.settings.quietHoursStart, input.settings.quietHoursEnd).toISOString()
  const queueLimit = input.now.getTime() + MAX_QUEUE_DAYS * DAY_MS

  for (const { automation, candidate } of pairs) {
    const report = reports.get(automation.id) as AutomationReport
    report.qualifying += 1
    const skip = (reason: SkipReason) => { report.skipped[reason] = (report.skipped[reason] ?? 0) + 1 }

    const reason = skipReasonFor(automation, candidate, input, index, chosenPhones)
    if (reason) { skip(reason); continue }

    let body: string
    try {
      body = renderAutomationText(automation.message_template, candidate, input.store, input.settings, input.now)
    } catch (error) {
      if (error instanceof AutomationTemplateError) { skip('cannot_fill'); continue }
      throw error
    }

    const recipe = getRecipe(automation.recipe)
    const phone = candidate.guest.phone as string
    chosenPhones.add(phone)
    report.queued += 1
    if (report.sample.length < SAMPLE_SIZE) report.sample.push(maskGuestName(candidate.guest.name))
    drafts.push({
      tenant_id: input.store.tenantId,
      automation_id: automation.id,
      recipe: automation.recipe,
      customer_id: candidate.guest.id,
      phone_e164: phone,
      body,
      occurrence_key: candidate.occurrenceKey,
      priority: recipe.priority,
      not_before: notBefore,
      expires_at: new Date(Math.min(Date.parse(candidate.expiresAt), queueLimit)).toISOString(),
      exit_if_ordered_after: recipe.exitOnOrder ? candidate.guest.lastOrderAt : null,
      entitlement_id: candidate.entitlementId ?? null,
      source: input.mode === 'all' ? 'run_now' : 'auto',
    })
  }

  return { drafts, reports }
}
