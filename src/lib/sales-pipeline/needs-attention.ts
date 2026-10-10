/**
 * "Where a human is still needed": leads sitting at a step that only staff (or
 * a nudge to the owner) can move. The goal is a pipeline with no human in the
 * loop, so this list is the measure — every entry is a step to automate.
 *
 * One action per lead: the earliest step it is stuck at. Each kind has a grace
 * period before it is listed (an owner gets three days to fill the form) and a
 * point where it turns overdue. Pure, so the rules are tested without a clock.
 */

import { displayedBuildStatus } from '@/lib/onboarding/build-staleness'
import { stageReachedAt } from './stages'
import type { PipelineLead } from './types'

export type AttentionKind =
  | 'follow_up_unpaid'
  | 'confirm_payment'
  | 'send_link'
  | 'nudge_owner'
  | 'build_failed'
  | 'not_live'
  | 'no_first_order'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

interface AttentionRule {
  label: string
  action: string
  /** Listed once the lead has waited this long. */
  listAfterMs: number
  /** Shown as overdue past this. */
  overdueAfterMs: number
}

/** In pipeline order: the order groups are shown in. */
export const ATTENTION_RULES: Readonly<Record<AttentionKind, AttentionRule>> = {
  follow_up_unpaid: {
    label: 'Ordered, never paid',
    action: 'Follow up: call or message the buyer',
    listAfterMs: 2 * DAY_MS,
    overdueAfterMs: 7 * DAY_MS,
  },
  confirm_payment: {
    label: 'Payment proof waiting',
    action: 'Check the proof and mark the lead Paid',
    listAfterMs: 0,
    overdueAfterMs: DAY_MS,
  },
  send_link: {
    label: 'Paid, no set-up link',
    action: 'Send the set-up link',
    listAfterMs: 0,
    overdueAfterMs: DAY_MS,
  },
  nudge_owner: {
    label: 'Set-up form not filled',
    action: 'Remind the owner to finish the set-up form',
    listAfterMs: 3 * DAY_MS,
    overdueAfterMs: 7 * DAY_MS,
  },
  build_failed: {
    label: 'Build failed',
    action: 'Read the error and retry the build',
    listAfterMs: 0,
    overdueAfterMs: DAY_MS,
  },
  not_live: {
    label: 'Built, not live',
    action: 'Clear what blocks the launch',
    listAfterMs: DAY_MS,
    overdueAfterMs: 3 * DAY_MS,
  },
  no_first_order: {
    label: 'Live, no orders yet',
    action: 'Help the owner share the store',
    listAfterMs: 7 * DAY_MS,
    overdueAfterMs: 14 * DAY_MS,
  },
}

const ATTENTION_ORDER = Object.keys(ATTENTION_RULES) as AttentionKind[]

export interface AttentionItem {
  kind: AttentionKind
  lead: PipelineLead
  /** When the lead started waiting at this step. */
  sinceMs: number
  isOverdue: boolean
  /** Extra context, e.g. the build error. */
  detail: string | null
}

interface Waiting {
  kind: AttentionKind
  since: string | null | undefined
  detail?: string | null
}

/** The step a lead is waiting at, before grace periods are applied. */
function waitingStep(lead: PipelineLead, nowMs: number): Waiting | null {
  if (lead.status === 'cancelled') return null
  const onboarding = lead.onboarding

  // An open store outranks a stale failed build row (stores opened by the older admin launch path).
  if (stageReachedAt(lead, 'live').isReached) {
    return lead.firstOrderAt ? null : { kind: 'no_first_order', since: lead.liveAt ?? lead.paidAt ?? lead.createdAt }
  }

  if (onboarding) {
    const buildStatus = displayedBuildStatus({ status: onboarding.status, tenantId: lead.tenantId, updatedAt: onboarding.updatedAt }, nowMs)
    if (buildStatus === 'failed') return { kind: 'build_failed', since: onboarding.finishedAt ?? onboarding.updatedAt, detail: onboarding.error }
  }

  if (onboarding?.status === 'ready') return { kind: 'not_live', since: onboarding.finishedAt ?? onboarding.updatedAt }
  if (onboarding?.status === 'awaiting_details') return { kind: 'nudge_owner', since: onboarding.createdAt }
  if (onboarding) return null // queued / running: the build is moving on its own.

  if (stageReachedAt(lead, 'paid').isReached) return { kind: 'send_link', since: lead.paidAt ?? lead.createdAt }
  if (lead.proofUploadedAt) return { kind: 'confirm_payment', since: lead.proofUploadedAt }
  return { kind: 'follow_up_unpaid', since: lead.createdAt }
}

export function needsAttentionFor(lead: PipelineLead, nowMs: number): AttentionItem | null {
  const waiting = waitingStep(lead, nowMs)
  if (!waiting?.since) return null
  const sinceMs = Date.parse(waiting.since)
  if (!Number.isFinite(sinceMs)) return null

  const rule = ATTENTION_RULES[waiting.kind]
  const waitedMs = nowMs - sinceMs
  if (waitedMs < rule.listAfterMs) return null

  return {
    kind: waiting.kind,
    lead,
    sinceMs,
    isOverdue: waitedMs > rule.overdueAfterMs,
    detail: waiting.detail ?? null,
  }
}

export interface AttentionGroup {
  kind: AttentionKind
  label: string
  action: string
  overdueCount: number
  /** Oldest first. */
  items: AttentionItem[]
}

export function findNeedsAttention(leads: readonly PipelineLead[], nowMs: number): AttentionGroup[] {
  const items = leads
    .map((lead) => needsAttentionFor(lead, nowMs))
    .filter((item): item is AttentionItem => item !== null)

  return ATTENTION_ORDER.map((kind) => {
    const groupItems = items.filter((item) => item.kind === kind).sort((a, b) => a.sinceMs - b.sinceMs)
    return {
      kind,
      label: ATTENTION_RULES[kind].label,
      action: ATTENTION_RULES[kind].action,
      overdueCount: groupItems.filter((item) => item.isOverdue).length,
      items: groupItems,
    }
  }).filter((group) => group.items.length > 0)
}
