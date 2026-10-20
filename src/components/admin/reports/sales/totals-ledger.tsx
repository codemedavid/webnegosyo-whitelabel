import { cn } from '@/lib/utils'
import { formatCount, formatMoney } from '@/lib/reports/format'
import { METRIC_GLOSSARY } from '@/lib/reports/metric-glossary'
import type { SalesTotals } from '@/lib/reports/read/report-rpc-rows'
import { totalsLedger, type LedgerLine } from '@/lib/reports/report-view-model'
import { MetricInfo } from '../metric-info'

const SIGN_WORDS: Readonly<Record<NonNullable<LedgerLine['sign']>, string>> = {
  '+': 'plus',
  '−': 'minus',
  '=': 'equals',
}

function LedgerRow({ line, isBlockStart }: { line: LedgerLine; isBlockStart: boolean }) {
  const entry = METRIC_GLOSSARY[line.key]
  return (
    <div
      className={cn(
        'flex items-center gap-3 py-2 text-[14px]',
        line.isTotal && 'border-t border-wn-line font-extrabold text-wn-ink',
        isBlockStart && 'mt-3 border-t border-dashed border-wn-line pt-4',
      )}
    >
      <dt className="flex min-w-0 flex-1 items-center gap-1.5">
        <span aria-hidden className="w-3 shrink-0 text-center font-bold text-muted-foreground">
          {line.sign ?? ''}
        </span>
        {line.sign && <span className="sr-only">{SIGN_WORDS[line.sign]} </span>}
        <span className={cn('truncate', !line.isTotal && 'font-semibold text-wn-ink/85')}>{line.label}</span>
        <MetricInfo term={entry.term} definition={entry.definition} formula={entry.formula} />
      </dt>
      <dd className="shrink-0 text-right tabular-nums lining-nums">{formatMoney(line.cents)}</dd>
    </div>
  )
}

/**
 * The reconciling totals (plan §3.2): every line adds up on screen, and the
 * three blocks are sales, what was billed, and what came in.
 */
export function TotalsLedger({ totals }: { totals: SalesTotals }) {
  const lines = totalsLedger(totals)
  return (
    <div className="flex flex-col gap-4">
      <dl>
        {lines.map((line, index) => (
          // Total billed closes two blocks, so the key needs the position.
          <LedgerRow key={`${line.key}-${index}`} line={line} isBlockStart={index > 0 && line.sign === null} />
        ))}
      </dl>
      <div className="flex items-center justify-between gap-3 rounded-xl bg-wn-sand px-3.5 py-2.5 text-[13.5px]">
        <span className="flex items-center gap-1.5 font-semibold text-wn-ink">
          {METRIC_GLOSSARY.voids.term}
          <MetricInfo term={METRIC_GLOSSARY.voids.term} definition={METRIC_GLOSSARY.voids.definition} align="end" />
        </span>
        <span className="text-right tabular-nums lining-nums text-muted-foreground">
          {totals.voids.orders === 0
            ? 'None'
            : `${formatCount(totals.voids.orders)} ${totals.voids.orders === 1 ? 'order' : 'orders'} · ${formatMoney(totals.voids.billedCents)}`}
        </span>
      </div>
      {totals.refundCents > 0 && (
        <p className="text-[12.5px] leading-snug text-muted-foreground">
          {formatMoney(totals.refundCents)} was handed back as change after orders were edited down. It is already out of
          collected, and the edited totals are already in sales.
        </p>
      )}
    </div>
  )
}
