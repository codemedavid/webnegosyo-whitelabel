import type { CampaignReport, CampaignRunReport } from '@/lib/texts/types'
import { peso } from '@/lib/texts/view/campaigns'
import { renderSample } from '@/lib/texts/view/message'
import { clockText, monthDayOf, toMs } from '@/lib/texts/view/time'

export function MessageBubble({ template, storeName, optOutLine }: { template: string; storeName: string; optOutLine: string | null }) {
  return (
    <section aria-labelledby="campaign-message" className="space-y-2">
      <h3 id="campaign-message" className="text-xs font-medium uppercase tracking-wide text-wn-stone">Message</h3>
      <div className="rounded-2xl border border-wn-line bg-white p-4 shadow-[0_1px_2px_rgba(29,24,21,0.04)]">
        <p className="mb-2 text-[11px] font-medium text-stone-400">{storeName}</p>
        <p className="max-w-md whitespace-pre-wrap break-words rounded-[1.1rem] rounded-bl-[0.3rem] bg-stone-100 px-3.5 py-2.5 text-sm leading-snug">{renderSample(template, storeName, optOutLine)}</p>
        <p className="mt-2 text-xs text-wn-stone">Shown with a sample guest&apos;s details.</p>
      </div>
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
      <h3 id="campaign-not-sent-title" className="text-xs font-medium uppercase tracking-wide text-wn-stone">Not sent, by reason</h3>
      <ul className="divide-y divide-wn-line rounded-2xl border border-wn-line bg-white px-4 text-sm shadow-[0_1px_2px_rgba(29,24,21,0.04)]">
        {reasons.map((entry) => (
          <li key={entry.reason} className="flex justify-between gap-3 py-2.5">
            <span>{entry.reason}</span>
            <span className="tabular-nums text-wn-stone">{entry.count.toLocaleString('en-US')}</span>
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
      <h3 id="campaign-runs" className="text-xs font-medium uppercase tracking-wide text-wn-stone">Each send</h3>
      <ul className="divide-y divide-wn-line rounded-2xl border border-wn-line bg-white px-4 text-sm shadow-[0_1px_2px_rgba(29,24,21,0.04)]">
        {report.runs.map((run) => {
          const at = toMs(run.startedAt)
          return (
            <li key={run.runId} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2.5">
              <span className="font-medium">{at === null ? 'Not started' : `${monthDayOf(at)}, ${clockText(at)}`}</span>
              <span className="tabular-nums text-wn-stone">
                {run.sent.toLocaleString('en-US')} sent · {run.cameBack.toLocaleString('en-US')} came back{run.sales > 0 ? ` · ${peso(run.sales)}` : ''}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
