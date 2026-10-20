import { Megaphone, Zap } from 'lucide-react'
import { activityChip } from '@/lib/texts/view/chips'
import { guestLabel, isNotSent, reasonText, type ActivityItem } from '@/lib/texts/view/activity'
import { clockText, timeAgoText, toMs } from '@/lib/texts/view/time'
import { StatusChip } from '../status-chip'

function whenText(item: ActivityItem, now: number): string {
  if (item.status === 'queued') {
    const at = toMs(item.notBefore)
    if (at === null) return ''
    return at > now ? `Sends at ${clockText(at)}` : `Due ${timeAgoText(item.notBefore, now)}`
  }
  return timeAgoText(item.sentAt ?? item.createdAt, now)
}

export function ActivityRow({ item, source, now }: { item: ActivityItem; source: string; now: number }) {
  const isCampaign = item.recipe === 'campaign' || item.source === 'campaign'
  const SourceIcon = isCampaign ? Megaphone : Zap
  return (
    <li className="flex items-center gap-3 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-wn-sand text-xs font-semibold text-wn-stone ring-1 ring-wn-line" aria-hidden="true">
        {(item.guestName ?? 'G').trim().charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{guestLabel(item.guestName, item.phoneLast4)}</p>
        <p className="flex items-center gap-1.5 truncate text-xs text-wn-stone">
          <SourceIcon className="h-3 w-3 shrink-0" aria-hidden="true" />{source}
          {isNotSent(item.status) && <span className="truncate"> · {reasonText(item.reason)}</span>}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
        <StatusChip chip={activityChip(item.status)} />
        <span className="text-right text-xs text-wn-stone tabular-nums sm:w-32">{whenText(item, now)}</span>
      </div>
    </li>
  )
}
