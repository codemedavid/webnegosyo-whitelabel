import { TrendingUp } from 'lucide-react'
import type { CampaignResults } from '@/lib/texts/types'
import { peso } from '@/lib/texts/view/campaigns'
import { monthDayText } from '@/lib/texts/view/time'

function Tile({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-wn-line bg-white p-4 shadow-[0_1px_2px_rgba(29,24,21,0.04)]">
      <p className="text-xs font-medium uppercase tracking-wide text-wn-stone">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-wn-stone">{sub}</p>}
    </div>
  )
}

/** Came back leads (it is the point); Sent and Not sent sit under it; the honest caption last. */
export function StatTiles({ totals }: { totals: CampaignResults }) {
  const rate = totals.sent > 0 ? Math.round((totals.cameBack / totals.sent) * 100) : 0
  const prefix = totals.isApproximate ? 'at least ' : ''
  return (
    <section aria-label="Results" className="space-y-3">
      {!totals.isFinal && totals.finalOn && (
        <p className="text-xs font-medium uppercase tracking-wide text-wn-stone">Results so far · final on {monthDayText(totals.finalOn.slice(0, 10))}</p>
      )}
      <div className="rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-white to-white p-5 shadow-[0_1px_2px_rgba(29,24,21,0.04)]">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-emerald-800"><TrendingUp className="h-3.5 w-3.5" aria-hidden="true" /> Came back</p>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
          <span className="text-4xl font-semibold tabular-nums tracking-tight text-emerald-900">{prefix}{totals.cameBack.toLocaleString('en-US')}</span>
          <span className="text-sm text-emerald-900/70">{totals.cameBack === 1 ? 'guest' : 'guests'} · {rate}% of everyone texted</span>
        </p>
        <p className="mt-3 text-sm text-foreground/80">
          <span className="text-lg font-semibold tabular-nums text-foreground">{peso(totals.sales)}</span> in their orders
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Tile label="Sent" value={totals.sent.toLocaleString('en-US')} />
        <Tile label="Not sent" value={totals.notSent.toLocaleString('en-US')}
          sub={totals.notSent > 0 ? <a href="#campaign-not-sent" className="inline-flex min-h-11 items-center underline underline-offset-2 sm:min-h-0">See why</a> : undefined} />
      </div>
      <p className="text-xs text-wn-stone">Came back = ordered within 14 days of their text. Some may have come anyway.</p>
    </section>
  )
}
