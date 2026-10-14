/**
 * The campaign list's rules: which filter a campaign belongs to, the order
 * the owner scans them in, which actions each status allows, and the cells.
 * Pure.
 */

import type { CampaignDisplayState, CampaignListItem, CampaignRunProgress } from '../types'
import type { CampaignFilter } from './url'

export type CampaignAction =
  | 'view' | 'edit' | 'pause' | 'resume' | 'duplicate' | 'delete' | 'archive' | 'unarchive' | 'switch_to_automatic'

const ACTIVE: readonly CampaignDisplayState[] = ['sending', 'waiting_for_phone', 'scheduled', 'repeating', 'paused', 'app_managed']
const DONE: readonly CampaignDisplayState[] = ['sent', 'finished']

export function inFilter(item: CampaignListItem, filter: CampaignFilter): boolean {
  if (filter === 'archived') return item.displayState === 'archived'
  if (item.displayState === 'archived') return false
  if (filter === 'active') return ACTIVE.includes(item.displayState)
  if (filter === 'drafts') return item.displayState === 'draft'
  if (filter === 'done') return DONE.includes(item.displayState)
  return true
}

const RANK: Record<CampaignDisplayState, number> = {
  sending: 0, waiting_for_phone: 1, scheduled: 2, repeating: 2, app_managed: 3, paused: 4, draft: 5,
  sent: 6, finished: 6, archived: 7,
}

function time(iso: string | null): number {
  const at = iso ? Date.parse(iso) : NaN
  return Number.isFinite(at) ? at : Number.MAX_SAFE_INTEGER
}

function compare(a: CampaignListItem, b: CampaignListItem): number {
  const rank = RANK[a.displayState] - RANK[b.displayState]
  if (rank !== 0) return rank
  if (RANK[a.displayState] === RANK.scheduled) return time(a.nextSendAt) - time(b.nextSendAt)
  if (a.displayState === 'draft') return time(b.updatedAt) - time(a.updatedAt)
  return time(b.createdAt) - time(a.createdAt)
}

export function sortCampaigns(list: readonly CampaignListItem[]): CampaignListItem[] {
  return [...list].sort(compare)
}

export function filterCampaigns(list: readonly CampaignListItem[], filter: CampaignFilter): CampaignListItem[] {
  return sortCampaigns(list.filter((item) => inFilter(item, filter)))
}

export function filterCounts(list: readonly CampaignListItem[]): Record<CampaignFilter, number> {
  const count = (filter: CampaignFilter) => list.filter((item) => inFilter(item, filter)).length
  return { all: count('all'), active: count('active'), drafts: count('drafts'), done: count('done'), archived: count('archived') }
}

export const EMPTY_FILTER_TEXT: Record<CampaignFilter, string> = {
  all: 'No campaigns yet',
  active: 'Nothing active right now',
  drafts: 'No drafts',
  done: 'Nothing sent yet',
  archived: 'Nothing archived',
}

/** The row menu, per the status table. Edit only while the campaign can still change. */
export function campaignActions(item: CampaignListItem): CampaignAction[] {
  const edit: CampaignAction[] = item.isEditable ? ['edit'] : []
  switch (item.displayState) {
    case 'draft': return ['edit', 'duplicate', 'delete']
    case 'scheduled':
    case 'repeating': return [...edit, 'pause', 'duplicate']
    case 'waiting_for_phone':
    case 'sending': return ['view', 'pause', 'duplicate']
    case 'paused': return ['resume', ...edit, 'duplicate', 'archive']
    case 'sent':
    case 'finished': return ['view', 'duplicate', 'archive']
    case 'archived': return ['view', 'duplicate', 'unarchive']
    case 'app_managed': return ['view', 'switch_to_automatic', 'duplicate', 'archive']
  }
}

export function actionLabel(action: CampaignAction, item: CampaignListItem): string {
  switch (action) {
    case 'view': return item.results ? 'View results' : 'View'
    case 'edit': return item.displayState === 'repeating' ? 'Edit next sends' : 'Edit'
    case 'pause': return 'Pause'
    case 'resume': return 'Resume'
    case 'duplicate': return 'Duplicate'
    case 'delete': return 'Delete'
    case 'archive': return 'Archive'
    case 'unarchive': return 'Unarchive'
    case 'switch_to_automatic': return 'Let it send by itself'
  }
}

/** A draft, or a scheduled campaign nothing has gone out for, opens straight into the editor. */
export function opensInEditor(item: CampaignListItem): boolean {
  if (item.displayState === 'draft') return true
  return item.displayState === 'scheduled' && item.isEditable && (item.results?.sent ?? 0) === 0
}

export function peso(amount: number): string {
  return `₱${Math.round(amount).toLocaleString('en-US')}`
}

export function sentCell(item: CampaignListItem, progress: CampaignRunProgress | null): string {
  if (progress) return `${progress.sent.toLocaleString('en-US')} / ${progress.total.toLocaleString('en-US')}`
  if (item.results && item.results.sent > 0) return item.results.sent.toLocaleString('en-US')
  return '—'
}

/** "Regulars · 148" when a count is known: the open run, or a one-off's single send. */
export function whoCell(item: CampaignListItem, progress: CampaignRunProgress | null): string {
  const count = progress?.total ?? (item.schedule.kind === 'one_off' && item.results ? item.results.sent + item.results.notSent : 0)
  return count > 0 ? `${item.audienceLabel} · ${count.toLocaleString('en-US')}` : item.audienceLabel
}

export function cameBackCell(item: CampaignListItem): string {
  const results = item.results
  if (!results || results.sent === 0) return '—'
  const lead = `${results.isApproximate ? 'at least ' : ''}${results.cameBack.toLocaleString('en-US')}`
  return results.sales > 0 ? `${lead} · ${peso(results.sales)}` : lead
}

/** "64 of 212 sent · 3 not sent · done around 6:40 PM" (finish text supplied). */
export function progressLine(progress: CampaignRunProgress, finish: string | null): string {
  const parts = [`${progress.sent.toLocaleString('en-US')} of ${progress.total.toLocaleString('en-US')} sent`]
  if (progress.notSent > 0) parts.push(`${progress.notSent.toLocaleString('en-US')} not sent`)
  if (finish) parts.push(`done ${finish}`)
  return parts.join(' · ')
}
