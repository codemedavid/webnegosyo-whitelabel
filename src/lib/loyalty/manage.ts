/**
 * Owner-side program management, pure part: what a merchant may do to a
 * program and what a valid program looks like. The I/O lives in
 * `repository.ts`; the route only translates HTTP into these calls.
 */

import { parseLoyaltyRules } from './rules'
import type { LoyaltyEarnMode, LoyaltyProgramScope, LoyaltyProgramStatus, LoyaltyRules } from './types'

export interface LoyaltyProgramInput {
  name: string
  description: string | null
  earnMode: LoyaltyEarnMode
  scope: LoyaltyProgramScope
  outletId: string | null
  rules: LoyaltyRules
  activatesAt: string | null
  endsAt: string | null
}

export type LoyaltyProgramInputParse =
  | { ok: true; value: LoyaltyProgramInput }
  | { ok: false; error: string }

const MAX_NAME = 80

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function parseLoyaltyProgramInput(raw: unknown): LoyaltyProgramInputParse {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'A program object is required.' }
  const input = raw as Record<string, unknown>

  const dates: Record<string, string | null> = {}
  for (const field of ['activatesAt', 'endsAt']) {
    const value = input[field]
    if (value == null || value === '') { dates[field] = null; continue }
    if (typeof value !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) {
      return { ok: false, error: 'Use a valid date and time with a time zone.' }
    }
    dates[field] = new Date(value).toISOString()
  }
  if (dates.activatesAt && dates.endsAt && dates.endsAt <= dates.activatesAt) return { ok: false, error: 'The end must be after activation.' }

  const name = text(input.name)
  if (!name) return { ok: false, error: 'Give the program a name.' }
  if (name.length > MAX_NAME) return { ok: false, error: `Keep the name under ${MAX_NAME} characters.` }

  const scope = input.scope === 'branch' ? 'branch' : 'business'
  const outletId = text(input.outletId) || null
  if (scope === 'branch' && !outletId) return { ok: false, error: 'A branch program needs a branch.' }

  const rules = parseLoyaltyRules(input.rules)
  if (!rules.ok) return { ok: false, error: rules.error }

  return {
    ok: true,
    value: {
      name,
      description: text(input.description) || null,
      earnMode: rules.value.earnMode,
      scope,
      outletId: scope === 'branch' ? outletId : null,
      rules: rules.value,
      activatesAt: dates.activatesAt,
      endsAt: dates.endsAt,
    },
  }
}

/**
 * draft → active → paused ⇄ active → ended. Ended is terminal: a program that
 * has ended keeps its ledger and its issued rewards, and a merchant who wants
 * it back creates a new one so no customer's history is silently reopened.
 */
const TRANSITIONS: Record<LoyaltyProgramStatus, readonly LoyaltyProgramStatus[]> = {
  draft: ['active', 'ended'],
  active: ['paused', 'ended'],
  paused: ['active', 'ended'],
  ended: [],
}

export function canTransitionProgram(from: LoyaltyProgramStatus, to: LoyaltyProgramStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * The columns a status change writes. Activation stamps `activates_at` the
 * FIRST time only: orders completed before that instant never earn, and a
 * pause/resume must not move the line and retroactively disqualify visits.
 */
export function programStatusPatch(
  current: { status: LoyaltyProgramStatus; activatesAt: string | null },
  to: LoyaltyProgramStatus,
  now: Date,
): { status: LoyaltyProgramStatus; activates_at?: string; ends_at?: string } | null {
  if (!canTransitionProgram(current.status, to)) return null
  const patch: { status: LoyaltyProgramStatus; activates_at?: string; ends_at?: string } = { status: to }
  if (to === 'active' && !current.activatesAt) patch.activates_at = now.toISOString()
  if (to === 'ended') patch.ends_at = now.toISOString()
  return patch
}

export interface BalanceCorrectionInput {
  programId: string
  customerKey: string
  delta: number
  note: string
}

export type BalanceCorrectionParse =
  | { ok: true; value: BalanceCorrectionInput }
  | { ok: false; error: string }

const MAX_CORRECTION = 10_000

/** A correction is auditable or it is refused: a note is mandatory. */
export function parseBalanceCorrection(raw: unknown): BalanceCorrectionParse {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'A correction object is required.' }
  const input = raw as Record<string, unknown>

  const programId = text(input.programId)
  if (!programId) return { ok: false, error: 'programId is required.' }
  const customerKey = text(input.customerKey)
  if (!/^(phone:\+\d{6,15}|email:[^\s@]+@[^\s@]+)$/.test(customerKey)) {
    return { ok: false, error: 'customerKey must be a phone:+… or email:… identity key.' }
  }
  const delta = Number(input.delta)
  if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > MAX_CORRECTION) {
    return { ok: false, error: 'delta must be a non-zero number within the correction limit.' }
  }
  const note = text(input.note)
  if (!note) return { ok: false, error: 'Say why the balance is being corrected.' }

  return { ok: true, value: { programId, customerKey, delta, note } }
}
