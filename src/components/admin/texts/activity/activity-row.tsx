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
  return (
    <li className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{guestLabel(item.guestName, item.phoneLast4)}</p>
        <p className="truncate text-xs text-muted-foreground">{source}</p>
        {isNotSent(item.status) && <p className="text-xs text-muted-foreground">{reasonText(item.reason)}</p>}
      </div>
      <div className="flex items-center gap-3">
        <StatusChip chip={activityChip(item.status)} />
        <span className="w-32 text-right text-xs text-muted-foreground tabular-nums">{whenText(item, now)}</span>
      </div>
    </li>
  )
}
