import type { CampaignReport, CampaignRunReport } from '@/lib/texts/types'
import { peso } from '@/lib/texts/view/campaigns'
import { renderSample } from '@/lib/texts/view/message'
import { clockText, monthDayOf, toMs } from '@/lib/texts/view/time'

export function MessageBubble({ template, storeName, optOutLine }: { template: string; storeName: string; optOutLine: string | null }) {
  return (
    <section aria-labelledby="campaign-message" className="space-y-2">
      <h3 id="campaign-message" className="text-sm font-semibold">Message</h3>
      <p className="max-w-md whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm bg-muted px-4 py-3 text-sm">{renderSample(template, storeName, optOutLine)}</p>
      <p className="text-xs text-muted-foreground">Shown with a sample guest&apos;s details.</p>
    </section>
  )
}

function mergeReasons(runs: CampaignRunReport[]): { reason: string; count: number }[] {
  const totals = new Map<string, number>()
  for (const run of runs) for (const entry of run.notSentByReason) totals.set(entry.reason, (totals.get(entry.reason) ?? 0) + entry.count)
  return [...totals.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count)
}

export function NotSentReasons({ runs }: { runs: CampaignRunReport[] }) {
  const reasons = mergeReasons(runs)
  if (reasons.length === 0) return null
  return (
    <section aria-labelledby="campaign-not-sent" id="campaign-not-sent" className="scroll-mt-4 space-y-2">
      <h3 id="campaign-not-sent-title" className="text-sm font-semibold">Not sent, by reason</h3>
      <ul className="divide-y rounded-2xl border bg-card px-4 text-sm">
        {reasons.map((entry) => (
          <li key={entry.reason} className="flex justify-between gap-3 py-2.5">
            <span>{entry.reason}</span>
            <span className="tabular-nums text-muted-foreground">{entry.count.toLocaleString('en-US')}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function RunsList({ report }: { report: CampaignReport }) {
  if (report.campaign.schedule.kind === 'one_off' || report.runs.length === 0) return null
  return (
    <section aria-labelledby="campaign-runs" className="space-y-2">
      <h3 id="campaign-runs" className="text-sm font-semibold">Each send</h3>
      <ul className="divide-y rounded-2xl border bg-card px-4 text-sm">
        {report.runs.map((run) => {
          const at = toMs(run.startedAt)
          return (
            <li key={run.runId} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2.5">
              <span className="font-medium">{at === null ? 'Not started' : `${monthDayOf(at)}, ${clockText(at)}`}</span>
              <span className="tabular-nums text-muted-foreground">
                {run.sent.toLocaleString('en-US')} sent · {run.cameBack.toLocaleString('en-US')} came back{run.sales > 0 ? ` · ${peso(run.sales)}` : ''}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
