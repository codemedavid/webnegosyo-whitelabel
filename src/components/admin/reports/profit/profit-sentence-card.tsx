import { CircleCheck, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { formatMoney, formatRatio } from '@/lib/reports/format'
import type { ProfitReport } from '@/lib/reports/profit-model'
import { MetricInfo } from '../metric-info'

interface SentenceLineProps {
  sign: '' | '−' | '='
  label: string
  cents: number
  info?: ReactNode
  detail?: string
}

function SentenceLine({ sign, label, cents, info, detail }: SentenceLineProps) {
  return (
    <div className="flex flex-col gap-0.5 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="flex min-w-0 items-center gap-1.5 text-[15px] font-semibold text-wn-ink">
          {sign && (
            <span aria-hidden className="w-3 shrink-0 text-wn-stone">
              {sign}
            </span>
          )}
          <span className="truncate">{label}</span>
          {info}
        </dt>
        <dd className="shrink-0 text-[17px] font-bold text-wn-ink tabular-nums lining-nums">{formatMoney(cents)}</dd>
      </div>
      {detail && <p className="pl-[18px] text-[12.5px] leading-snug text-muted-foreground tabular-nums">{detail}</p>}
    </div>
  )
}

function ingredientNote(report: ProfitReport): { definition: string; formula: string } {
  const { coverage } = report
  if (report.ingredientBasis === 'purchases') {
    return {
      definition: 'Estimate: based on what you bought, not what you used. Track stock with recipes to see what was really used.',
      formula: 'Every Ingredients expense recorded in this period',
    }
  }
  const share = coverage.costedShare === null ? 'Dish coverage is visible to store-wide accounts.' : `${formatRatio(coverage.costedShare)} of dishes sold had a cost.`
  return {
    definition: `From your recipes, at what each ingredient cost when it was used. ${share}`,
    formula: 'Recipes used + waste and count losses + ingredients that didn’t go into stock',
  }
}

function ingredientDetail(report: ProfitReport): string | undefined {
  if (report.ingredientBasis === 'purchases') return 'Estimate · from what you bought'
  const parts = [`Recipes ${formatMoney(report.recipeCogsCents)}`]
  if (report.lossesCents !== 0) parts.push(`Waste & counts ${formatMoney(report.lossesCents)}`)
  if (report.directIngredientCents !== 0) parts.push(`Not stocked ${formatMoney(report.directIngredientCents)}`)
  return parts.join(' · ')
}

/** "Lugi · −₱3,200" in red with an icon; a profit in deep green with ✓. Never colour alone. */
function ProfitVerdict({ report }: { report: ProfitReport }) {
  const isLoss = report.profitCents < 0
  const share = report.ratios.profit === null ? null : formatRatio(Math.abs(report.ratios.profit))
  if (isLoss) {
    return (
      <p className="flex items-center gap-1.5 text-[13.5px] font-bold text-red-700">
        <TriangleAlert className="size-4 shrink-0" aria-hidden />
        <span>
          Lugi (loss) · {formatMoney(report.profitCents)}
          {share && ` · ${share} of sales`}
        </span>
      </p>
    )
  }
  return (
    <p className="flex items-center gap-1.5 text-[13.5px] font-bold text-emerald-800">
      <CircleCheck className="size-4 shrink-0" aria-hidden />
      <span>{share ? `${share} of sales` : 'No sales yet'}</span>
    </p>
  )
}

export interface ProfitSentenceCardProps {
  report: ProfitReport
  /** "This month so far · all branches". */
  caption: string
}

/** Sales − Ingredients − Expenses = Profit, in one card (plan §5.3). One hero number: profit. */
export function ProfitSentenceCard({ report, caption }: ProfitSentenceCardProps) {
  const note = ingredientNote(report)
  const isLoss = report.profitCents < 0
  return (
    <section aria-label="Profit" className="rounded-2xl bg-white p-4 ring-1 ring-border sm:p-5">
      <p className="text-[12.5px] font-semibold text-muted-foreground tabular-nums">{caption}</p>
      <dl className="mt-1 divide-y divide-wn-line">
        <SentenceLine sign="" label="Sales (Benta)" cents={report.netSalesCents} />
        <SentenceLine
          sign="−"
          label="Ingredients (Sangkap)"
          cents={report.ingredientCostCents}
          info={<MetricInfo term="Ingredients" definition={note.definition} formula={note.formula} />}
          detail={ingredientDetail(report)}
        />
        <SentenceLine sign="−" label="Expenses (Gastos)" cents={report.expensesCents} />
        <div className="flex flex-col gap-1 pt-3">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="flex items-center gap-1.5 text-[16px] font-extrabold text-wn-ink">
              <span aria-hidden className="w-3 shrink-0 text-wn-stone">
                =
              </span>
              Profit (Kita)
            </dt>
            <dd
              className={cn(
                'shrink-0 text-[30px] font-extrabold leading-none tracking-[-0.02em] tabular-nums lining-nums sm:text-[34px]',
                isLoss ? 'text-red-700' : 'text-emerald-800',
              )}
            >
              {formatMoney(report.profitCents)}
            </dd>
          </div>
          <div className="pl-[18px]">
            <ProfitVerdict report={report} />
          </div>
        </div>
      </dl>
      {(report.capexCents > 0 || report.notExpenseCents > 0) && (
        <p className="mt-3 text-[12.5px] leading-snug text-muted-foreground tabular-nums">
          Not in profit:{' '}
          {[
            report.capexCents > 0 ? `big purchases ${formatMoney(report.capexCents)}` : null,
            report.notExpenseCents > 0 ? `owner took cash, deposits & loans ${formatMoney(report.notExpenseCents)}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          . See Cash flow.
        </p>
      )}
    </section>
  )
}
