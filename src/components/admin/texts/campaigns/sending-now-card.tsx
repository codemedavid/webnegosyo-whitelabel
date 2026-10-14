'use client'

import { Button } from '@/components/ui/button'
import type { CampaignListItem, CampaignRunProgress } from '@/lib/texts/types'
import { progressLine } from '@/lib/texts/view/campaigns'
import { finishText, toMs, clockText } from '@/lib/texts/view/time'
import { cn } from '@/lib/utils'
import { useServerNow, useTexts } from '../texts-context'
import { useCampaignActions } from './campaign-actions'

export function ProgressBar({ progress, tone = 'emerald' }: { progress: CampaignRunProgress; tone?: 'emerald' | 'amber' }) {
  const done = progress.total > 0 ? Math.min(1, (progress.sent + progress.notSent) / progress.total) : 0
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={progress.total}
      aria-valuenow={progress.sent}
      aria-label={`${progress.sent} of ${progress.total} sent`}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none', tone === 'amber' ? 'bg-amber-500' : 'bg-emerald-500')}
        style={{ width: `${done * 100}%` }}
      />
    </div>
  )
}

/** The progress words for one open run: quiet hours and a missing phone get their own line. */
export function useProgressText(progress: CampaignRunProgress): string {
  const now = useServerNow()
  const { live } = useTexts()
  if (progress.isWaitingForPhone) {
    return `Waiting for your phone. ${progress.waiting.toLocaleString('en-US')} texts are ready to go.`
  }
  if (progress.isQuietNow) {
    const until = toMs(live.sender.quietUntil)
    return until === null ? 'Resting for quiet hours.' : `Resting for quiet hours, continues at ${clockText(until)}`
  }
  // A late or offline phone promises no done-time.
  const isAway = ['late', 'offline', 'none', 'unknown'].includes(live.sender.heroState)
  const finish = isAway ? null : toMs(progress.finishAt)
  return progressLine(progress, finish === null ? null : finishText(finish, now))
}

function SendingRow({ item, progress }: { item: CampaignListItem; progress: CampaignRunProgress }) {
  const run = useCampaignActions()
  const text = useProgressText(progress)
  const isWaiting = progress.isWaitingForPhone
  return (
    <li className={cn('space-y-3 rounded-2xl border bg-card p-5', isWaiting && 'border-amber-300 bg-amber-50/60 dark:bg-amber-950/20')}>
      <div className="flex items-center justify-between gap-3">
        <p className="truncate font-semibold">{item.name}</p>
        <div className="flex shrink-0 gap-2">
          <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-8" onClick={() => run('pause', item)}>Pause</Button>
          <Button type="button" size="sm" variant="ghost" className="min-h-11 sm:min-h-8" onClick={() => run('view', item)}>View</Button>
        </div>
      </div>
      <ProgressBar progress={progress} tone={isWaiting ? 'amber' : 'emerald'} />
      <p className={cn('text-sm tabular-nums', isWaiting ? 'text-amber-800 dark:text-amber-300' : 'text-muted-foreground')}>{text}</p>
    </li>
  )
}

/** Campaigns sending or waiting for a phone; hidden when nothing is. */
export function SendingNowCard() {
  const { campaigns, live } = useTexts()
  const open = campaigns
    .map((item) => ({ item, progress: live.progress[item.id] ?? null }))
    .filter((entry): entry is { item: CampaignListItem; progress: CampaignRunProgress } => entry.progress !== null && entry.progress !== undefined)
    .filter(({ progress }) => progress.waiting > 0 || progress.isWaitingForPhone)
  if (open.length === 0) return null
  return (
    <section aria-label="Sending now" className="space-y-2">
      <h2 className="text-sm font-semibold">Sending now</h2>
      <ul className="space-y-2">
        {open.map(({ item, progress }) => <SendingRow key={item.id} item={item} progress={progress} />)}
      </ul>
    </section>
  )
}
