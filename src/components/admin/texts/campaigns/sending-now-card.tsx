'use client'

import { Pause, Send, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CampaignListItem, CampaignRunProgress } from '@/lib/texts/types'
import { progressLine } from '@/lib/texts/view/campaigns'
import { finishText, toMs, clockText } from '@/lib/texts/view/time'
import { cn } from '@/lib/utils'
import { useServerNow, useTexts } from '../texts-context'
import { IconTile } from '../status-chip'
import { useCampaignActions } from './campaign-actions'

export function ProgressBar({ progress, tone = 'emerald' }: { progress: CampaignRunProgress; tone?: 'emerald' | 'amber' }) {
  const done = progress.total > 0 ? Math.min(1, (progress.sent + progress.notSent) / progress.total) : 0
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-stone-200/70"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={progress.total}
      aria-valuenow={progress.sent}
      aria-label={`${progress.sent} of ${progress.total} sent`}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none', tone === 'amber' ? 'bg-amber-500' : 'bg-gradient-to-r from-emerald-500 to-emerald-400')}
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
  const pct = progress.total > 0 ? Math.round(((progress.sent + progress.notSent) / progress.total) * 100) : 0
  return (
    <li className={cn('rounded-2xl border bg-card p-5 shadow-[0_1px_2px_rgba(29,24,21,0.04)]', isWaiting && 'border-amber-200 bg-gradient-to-br from-amber-50/80 to-white')}>
      <div className="flex items-start gap-4">
        <IconTile tone={isWaiting ? 'amber' : 'emerald'} className="hidden sm:flex">{isWaiting ? <Smartphone /> : <Send />}</IconTile>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-wn-stone">{isWaiting ? 'Waiting for your phone' : 'Sending now'}</p>
              <p className="truncate font-semibold">{item.name}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button type="button" size="sm" variant="outline" className="min-h-11 rounded-full bg-white px-3 sm:min-h-8" onClick={() => run('pause', item)}>
                <Pause className="h-3.5 w-3.5" aria-hidden="true" /> Pause
              </Button>
              <Button type="button" size="sm" variant="ghost" className="min-h-11 rounded-full px-3 sm:min-h-8" onClick={() => run('view', item)}>View</Button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ProgressBar progress={progress} tone={isWaiting ? 'amber' : 'emerald'} />
            <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums">{pct}%</span>
          </div>
          <p className={cn('text-sm tabular-nums', isWaiting ? 'text-amber-800' : 'text-wn-stone')}>{text}</p>
        </div>
      </div>
    </li>
  )
}

/** Campaigns sending or waiting for a phone; hidden when nothing is. */
export function SendingNowCard() {
  const { campaigns, live } = useTexts()
  const open = campaigns
    .map((item) => ({ item, progress: live.progress[item.id] ?? null }))
    .filter((entry): entry is { item: CampaignListItem; progress: CampaignRunProgress } => entry.progress !== null)
    .filter(({ progress }) => progress.waiting > 0 || progress.isWaitingForPhone)
  if (open.length === 0) return null
  return (
    <section aria-label="Sending now">
      <ul className="space-y-3">
        {open.map(({ item, progress }) => <SendingRow key={item.id} item={item} progress={progress} />)}
      </ul>
    </section>
  )
}
