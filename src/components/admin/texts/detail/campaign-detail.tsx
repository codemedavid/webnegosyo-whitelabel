'use client'

import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getCampaignReportAction } from '@/app/actions/texts'
import type { CampaignListItem, CampaignReport, CampaignRunReport } from '@/lib/texts/types'
import { campaignChip } from '@/lib/texts/view/chips'
import type { CampaignAction } from '@/lib/texts/view/campaigns'
import { monthDayOf, toMs } from '@/lib/texts/view/time'
import { useCampaignActions } from '../campaigns/campaign-actions'
import { CampaignRowMenu } from '../campaigns/campaign-row-menu'
import { ProgressBar, useProgressText } from '../campaigns/sending-now-card'
import { SheetFrame } from '../sheet-frame'
import { StatusChip } from '../status-chip'
import { useLiveProgress, useTexts } from '../texts-context'
import { GuestsList } from './guests-list'
import { MessageBubble, NotSentReasons, RunsList } from './report-sections'
import { StatTiles } from './stat-tiles'

const SENDING_REFRESH_MS = 15_000

const NOT_FOUND = 'not_found'

async function readReport(tenantId: string, campaignId: string): Promise<CampaignReport> {
  const result = await getCampaignReportAction(tenantId, campaignId, null)
  if (!result.ok) throw new Error(result.error, { cause: result.code })
  return result.value
}

function isGone(error: unknown): boolean {
  return error instanceof Error && error.cause === NOT_FOUND
}

/** "148 guests when it started" — the latest send's planned size. */
function startedWith(runs: CampaignRunReport[]): number | null {
  const latest = [...runs].sort((a, b) => (toMs(b.startedAt) ?? 0) - (toMs(a.startedAt) ?? 0))[0]
  if (!latest) return null
  const total = latest.sent + latest.notSent + latest.waiting
  return total > 0 ? total : null
}

function primaryAction(item: CampaignListItem): CampaignAction {
  if (item.displayState === 'paused') return 'resume'
  if (['sending', 'waiting_for_phone', 'scheduled', 'repeating'].includes(item.displayState)) return 'pause'
  return 'duplicate'
}

const PRIMARY_LABEL: Partial<Record<CampaignAction, string>> = { resume: 'Resume', pause: 'Pause', duplicate: 'Duplicate' }

function ProgressBlock({ item }: { item: CampaignListItem }) {
  const progress = useLiveProgress(item.id)
  const text = useProgressText(progress ?? { runId: '', sent: 0, notSent: 0, waiting: 0, total: 0, finishAt: null, isQuietNow: false, isWaitingForPhone: false })
  if (!progress) return null
  return (
    <section aria-label="Progress" className="space-y-2 rounded-2xl border bg-card p-4">
      <ProgressBar progress={progress} tone={progress.isWaitingForPhone ? 'amber' : 'emerald'} />
      <p className="text-sm text-muted-foreground tabular-nums">{text}</p>
    </section>
  )
}

/** The report: results first, then the message, who, why some weren't sent, and each guest. */
export function CampaignDetail({ campaignId, item, onClose }: { campaignId: string; item: CampaignListItem | null; onClose: () => void }) {
  const { tenantId, storeName, optOutLine } = useTexts()
  const run = useCampaignActions()
  const progress = useLiveProgress(campaignId)
  const query = useQuery({
    queryKey: ['texts-report', tenantId, campaignId],
    queryFn: () => readReport(tenantId, campaignId),
    refetchInterval: progress ? SENDING_REFRESH_MS : false,
    refetchIntervalInBackground: false,
    retry: (count, error) => !isGone(error) && count < 1,
  })
  const campaign = item ?? query.data?.campaign ?? null
  const report = query.data

  if (!campaign) {
    return (
      <SheetFrame title="Campaign" onClose={onClose}>
        <div className="p-6">
          {isGone(query.error) ? (
            <div className="space-y-3">
              <p className="text-sm">This campaign was deleted.</p>
              <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={onClose}>Close</Button>
            </div>
          ) : query.isError ? <ReportError onRetry={() => void query.refetch()} /> : <Loading />}
        </div>
      </SheetFrame>
    )
  }

  const primary = primaryAction(campaign)
  const isNothingSent = !campaign.results || campaign.results.sent === 0
  return (
    <SheetFrame
      title={campaign.name}
      description={<StatusChip chip={campaignChip(campaign.displayState)} />}
      headerExtra={
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" variant={primary === 'duplicate' ? 'outline' : 'default'} className="min-h-11 sm:min-h-8" onClick={() => run(primary, campaign)}>
            {PRIMARY_LABEL[primary]}
          </Button>
          <CampaignRowMenu item={campaign} />
        </div>
      }
      onClose={onClose}
    >
      <div className="space-y-8 px-4 py-6 sm:px-6">
        {campaign.displayState === 'app_managed' && (
          <p className="rounded-xl border bg-muted/40 px-4 py-3 text-sm">
            You send this one by hand from the SmartMenu app.{' '}
            <button type="button" className="min-h-11 font-medium underline underline-offset-2 sm:min-h-0" onClick={() => run('switch_to_automatic', campaign)}>Let it send by itself</button>
          </p>
        )}
        {campaign.displayState === 'paused' && campaign.pauseReason === 'missed_no_phone' && (
          <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            Paused itself {monthDayOf(toMs(campaign.updatedAt) ?? Date.now())}: no phone checked in for a day, so it didn&apos;t go out late. Resume texts guests who still match.
          </p>
        )}
        {progress && <ProgressBlock item={campaign} />}
        {report?.totals && report.totals.sent + report.totals.notSent > 0 && <StatTiles totals={report.totals} />}
        {isNothingSent && !progress && campaign.nextSendAt && (
          <p className="rounded-xl border px-4 py-3 text-sm">Nothing sent yet. {campaign.whenLabel}.</p>
        )}
        {!campaign.isEditable && campaign.displayState !== 'draft' && (
          <p className="text-xs text-muted-foreground">
            The message is locked once the first text goes out.{' '}
            <button type="button" className="underline underline-offset-2" onClick={() => run('duplicate', campaign)}>Duplicate to change it</button>
          </p>
        )}
        <MessageBubble template={campaign.messageTemplate} storeName={storeName} optOutLine={optOutLine} />
        <section aria-labelledby="campaign-who" className="space-y-1">
          <h3 id="campaign-who" className="text-sm font-semibold">Who</h3>
          <p className="text-sm">
            {campaign.audienceLabel}
            {report && startedWith(report.runs) !== null && ` · ${startedWith(report.runs)?.toLocaleString('en-US')} guests when it started`}
          </p>
        </section>
        {query.isError && <ReportError onRetry={() => void query.refetch()} />}
        {query.isLoading && <Loading />}
        {report && (
          <>
            <NotSentReasons runs={report.runs} />
            <GuestsList key={report.campaign.updatedAt} campaignId={campaign.id} initial={report.guests} initialCursor={report.nextCursor} />
            <RunsList report={report} />
          </>
        )}
      </div>
    </SheetFrame>
  )
}

function Loading() {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Loading results…
    </p>
  )
}

function ReportError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex items-center gap-3 rounded-xl border px-4 py-3 text-sm">
      <span className="flex-1">Couldn&apos;t load results.</span>
      <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-8" onClick={onRetry}>Try again</Button>
    </div>
  )
}
