/**
 * The words and colours of every status chip on the Texts page. A chip is
 * always a word plus a dot or icon — colour alone never carries meaning. Pure.
 */

import type { CampaignDisplayState, PhoneState } from '../types'

export type ChipTone = 'emerald' | 'amber' | 'red' | 'sky' | 'grey'
export type ChipIcon = 'dot' | 'repeat' | 'check'

export interface Chip {
  label: string
  tone: ChipTone
  icon: ChipIcon
  isPulsing?: boolean
  isOutline?: boolean
}

const CAMPAIGN_CHIPS: Record<CampaignDisplayState, Chip> = {
  draft: { label: 'Draft', tone: 'grey', icon: 'dot' },
  scheduled: { label: 'Scheduled', tone: 'sky', icon: 'dot' },
  repeating: { label: 'Repeating', tone: 'sky', icon: 'repeat' },
  waiting_for_phone: { label: 'Waiting for phone', tone: 'amber', icon: 'dot' },
  sending: { label: 'Sending', tone: 'emerald', icon: 'dot', isPulsing: true },
  paused: { label: 'Paused', tone: 'amber', icon: 'dot' },
  sent: { label: 'Sent', tone: 'emerald', icon: 'check' },
  finished: { label: 'Finished', tone: 'grey', icon: 'check' },
  archived: { label: 'Archived', tone: 'grey', icon: 'dot', isOutline: true },
  app_managed: { label: 'You send it from the app', tone: 'grey', icon: 'dot' },
}

export function campaignChip(state: CampaignDisplayState): Chip {
  return CAMPAIGN_CHIPS[state] ?? CAMPAIGN_CHIPS.draft
}

const PHONE_CHIPS: Record<PhoneState, Chip> = {
  never: { label: 'Never checked in', tone: 'grey', icon: 'dot' },
  ready: { label: 'Ready', tone: 'emerald', icon: 'dot' },
  resting: { label: 'Resting', tone: 'amber', icon: 'dot' },
  late: { label: 'Checking in late', tone: 'amber', icon: 'dot' },
  offline: { label: 'Offline', tone: 'amber', icon: 'dot' },
}

export function phoneChip(state: PhoneState, isInactive: boolean): Chip {
  if (state === 'offline' && isInactive) return { label: 'Inactive', tone: 'grey', icon: 'dot' }
  return PHONE_CHIPS[state] ?? PHONE_CHIPS.never
}

const NOT_SENT: Chip = { label: 'Not sent', tone: 'grey', icon: 'dot' }

export function activityChip(status: string): Chip {
  if (status === 'queued') return { label: 'Waiting', tone: 'amber', icon: 'dot' }
  if (status === 'claimed') return { label: 'Sending', tone: 'emerald', icon: 'dot', isPulsing: true }
  if (status === 'sent') return { label: 'Sent', tone: 'emerald', icon: 'check' }
  return NOT_SENT
}
