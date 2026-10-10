/**
 * The superadmin sales pipeline: from the order form to a second month paid.
 *
 * Each stage is read from its own evidence (a stamp or a status). A lead that
 * reached a LATER stage has passed every earlier one, even when that stage
 * left no trace — the ₱999 funnel confirms payment out of band, so "proof
 * uploaded" never happens there. Such an implied stage counts, but has no time
 * and stays out of every median. That keeps the counts monotonic, so each
 * stage's conversion from the one before is a real share.
 *
 * Pure: the page passes leads in and renders what comes out.
 */

import type { PipelineLead } from './types'

export type PipelineStageKey =
  | 'ordered'
  | 'proof'
  | 'paid'
  | 'link_sent'
  | 'wizard_done'
  | 'built'
  | 'live'
  | 'first_order'
  | 'month_two'

export interface PipelineStage {
  key: PipelineStageKey
  label: string
  /** What reaching the stage means, for the card's hint. */
  hint: string
}

export const PIPELINE_STAGES: readonly PipelineStage[] = [
  { key: 'ordered', label: 'Ordered', hint: 'Filled in the order form' },
  { key: 'proof', label: 'Proof sent', hint: 'Uploaded a payment proof' },
  { key: 'paid', label: 'Paid', hint: 'Staff confirmed the payment' },
  { key: 'link_sent', label: 'Link sent', hint: 'Set-up link issued' },
  { key: 'wizard_done', label: 'Set-up done', hint: 'Owner submitted the set-up form' },
  { key: 'built', label: 'Store built', hint: 'Automatic build finished' },
  { key: 'live', label: 'Live', hint: 'Store open for orders' },
  { key: 'first_order', label: 'First order', hint: 'A customer ordered' },
  { key: 'month_two', label: 'Month 2 paid', hint: 'Second subscription payment' },
]

const PAID_STATUSES = new Set(['paid', 'setup_in_progress', 'live'])
const SUBMITTED_ONBOARDING_STATUSES = new Set(['queued', 'running', 'ready', 'failed'])

export interface StageReached {
  isReached: boolean
  /** When, if the lead left a usable stamp for this very stage. */
  atMs: number | null
}

const NOT_REACHED: StageReached = { isReached: false, atMs: null }

function parseMs(value: string | null | undefined): number | null {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

function evidence(isReached: boolean, at: string | null | undefined): StageReached {
  return isReached ? { isReached: true, atMs: parseMs(at) } : NOT_REACHED
}

/** The stage's OWN evidence, ignoring later stages. */
function ownEvidence(lead: PipelineLead, key: PipelineStageKey): StageReached {
  const onboarding = lead.onboarding
  switch (key) {
    case 'ordered':
      return evidence(true, lead.createdAt)
    case 'proof':
      return evidence(!!lead.proofUploadedAt, lead.proofUploadedAt)
    case 'paid':
      return evidence(!!lead.paidAt || PAID_STATUSES.has(lead.status), lead.paidAt)
    case 'link_sent':
      return evidence(!!onboarding, onboarding?.createdAt)
    case 'wizard_done':
      return evidence(!!onboarding && SUBMITTED_ONBOARDING_STATUSES.has(onboarding.status), onboarding?.startedAt)
    case 'built':
      return evidence(onboarding?.status === 'ready', onboarding?.finishedAt)
    case 'live':
      return evidence(!!lead.liveAt || lead.status === 'live', lead.liveAt)
    case 'first_order':
      return evidence(!!lead.firstOrderAt, lead.firstOrderAt)
    case 'month_two':
      return evidence(!!lead.secondPaymentAt, lead.secondPaymentAt)
  }
}

function stageIndex(key: PipelineStageKey): number {
  return PIPELINE_STAGES.findIndex((stage) => stage.key === key)
}

/** Whether (and when) a lead reached a stage — directly, or by reaching a later one. */
export function stageReachedAt(lead: PipelineLead, key: PipelineStageKey): StageReached {
  const own = ownEvidence(lead, key)
  if (own.isReached) return own

  const isPassedLater = PIPELINE_STAGES.slice(stageIndex(key) + 1).some(
    (later) => ownEvidence(lead, later.key).isReached,
  )
  return isPassedLater ? { isReached: true, atMs: null } : NOT_REACHED
}

export interface PipelineStageSummary extends PipelineStage {
  count: number
  /** Share of the previous stage that reached this one; null for the first stage or after an empty one. */
  conversionPct: number | null
  /** Median time from the nearest earlier stamped stage, over leads with both stamps. */
  medianFromPreviousMs: number | null
}

export interface PipelineSummary {
  total: number
  stages: PipelineStageSummary[]
  orderToLiveMedianMs: number | null
  paidToLiveMedianMs: number | null
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** A duration only when both ends are known and in order (backfilled stamps can be out of order). */
function durationMs(fromMs: number | null, toMs: number | null): number | null {
  if (fromMs === null || toMs === null || toMs < fromMs) return null
  return toMs - fromMs
}

function medianBetween(leads: readonly PipelineLead[], from: PipelineStageKey, to: PipelineStageKey): number | null {
  const durations = leads
    .map((lead) => durationMs(stageReachedAt(lead, from).atMs, stageReachedAt(lead, to).atMs))
    .filter((value): value is number => value !== null)
  return median(durations)
}

/** Time from the closest earlier stage that this lead stamped, to this stage. */
function stepDurationMs(lead: PipelineLead, index: number): number | null {
  const atMs = stageReachedAt(lead, PIPELINE_STAGES[index].key).atMs
  if (atMs === null) return null
  for (let earlier = index - 1; earlier >= 0; earlier--) {
    const fromMs = stageReachedAt(lead, PIPELINE_STAGES[earlier].key).atMs
    if (fromMs !== null) return durationMs(fromMs, atMs)
  }
  return null
}

function roundPct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null
}

export function summarizePipeline(leads: readonly PipelineLead[]): PipelineSummary {
  const counts = PIPELINE_STAGES.map(
    (stage) => leads.filter((lead) => stageReachedAt(lead, stage.key).isReached).length,
  )

  const stages = PIPELINE_STAGES.map((stage, index) => {
    const steps = leads
      .map((lead) => stepDurationMs(lead, index))
      .filter((value): value is number => value !== null)
    return {
      ...stage,
      count: counts[index],
      conversionPct: index === 0 ? null : roundPct(counts[index], counts[index - 1]),
      medianFromPreviousMs: index === 0 ? null : median(steps),
    }
  })

  return {
    total: leads.length,
    stages,
    orderToLiveMedianMs: medianBetween(leads, 'ordered', 'live'),
    paidToLiveMedianMs: medianBetween(leads, 'paid', 'live'),
  }
}
