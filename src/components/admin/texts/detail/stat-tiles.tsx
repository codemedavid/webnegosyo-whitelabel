import type { CampaignResults } from '@/lib/texts/types'
import { peso } from '@/lib/texts/view/campaigns'
import { monthDayText } from '@/lib/texts/view/time'

function Tile({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

/** Sent · Not sent · Came back · Their orders, with the honest caption under them. */
export function StatTiles({ totals }: { totals: CampaignResults }) {
  const rate = totals.sent > 0 ? Math.round((totals.cameBack / totals.sent) * 100) : 0
  const prefix = totals.isApproximate ? 'at least ' : ''
  return (
    <section aria-label="Results" className="space-y-2">
      {!totals.isFinal && totals.finalOn && (
        <p className="text-xs font-medium text-muted-foreground">Results so far · final on {monthDayText(totals.finalOn.slice(0, 10))}</p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Sent" value={totals.sent.toLocaleString('en-US')} />
        <Tile label="Not sent" value={totals.notSent.toLocaleString('en-US')}
          sub={totals.notSent > 0 ? <a href="#campaign-not-sent" className="underline underline-offset-2">See why</a> : undefined} />
        <Tile label="Came back" value={`${prefix}${totals.cameBack.toLocaleString('en-US')}`} sub={`${totals.cameBack === 1 ? 'guest' : 'guests'} (${rate}%)`} />
        <Tile label="Their orders" value={peso(totals.sales)} />
      </div>
      <p className="text-xs text-muted-foreground">Came back = ordered within 14 days of their text. Some may have come anyway.</p>
    </section>
  )
}
