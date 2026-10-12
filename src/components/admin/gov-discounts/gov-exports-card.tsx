import { Download, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { GovDiscountKind } from '@/lib/gov-discount'
import { periodSearchParams, type ReportPeriod } from '@/lib/gov-discount-reports/period'
import { bookTitle, type ExportBook } from '@/lib/gov-discount-reports/sales-book'

export interface GovExportsCardProps {
  tenantId: string
  period: ReportPeriod
  /** Kinds with lines in the period. Senior and PWD are always offered. */
  kinds: readonly GovDiscountKind[]
  /** True when the period holds more rows than one file may carry. */
  isTruncated: boolean
}

const ALWAYS_OFFERED: readonly GovDiscountKind[] = ['senior', 'pwd']

function exportHref(tenantId: string, book: ExportBook, period: ReportPeriod): string {
  const query = new URLSearchParams({ tenantId, book, ...periodSearchParams(period) })
  return `/api/gov-discounts/export?${query.toString()}`
}

/**
 * The files an accountant asks for at month end, and what they are — in
 * words an owner can forward without editing.
 */
export function GovExportsCard({ tenantId, period, kinds, isTruncated }: GovExportsCardProps) {
  const books: ExportBook[] = [
    ...ALWAYS_OFFERED,
    ...kinds.filter((kind) => !ALWAYS_OFFERED.includes(kind)),
    'summary',
  ]

  return (
    <section aria-labelledby="gov-exports-title" className="rounded-xl border bg-card p-5">
      <div className="flex items-start gap-3">
        <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 space-y-1">
          <h2 id="gov-exports-title" className="font-semibold">
            Sales books for {period.label}
          </h2>
          <p className="text-sm text-muted-foreground">
            CSV files that open in Excel or Google Sheets, one line per discount.
          </p>
        </div>
      </div>

      {isTruncated ? (
        <p className="mt-4 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          This period has too many records for one file. Choose a single month to download.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {books.map((book) => (
            <Button key={book} asChild variant={book === 'summary' ? 'secondary' : 'outline'} size="sm">
              {/* No `download` attribute: a refusal must show its message, not save as a .csv. */}
              <a href={exportHref(tenantId, book, period)}>
                <Download className="mr-1.5 h-4 w-4" aria-hidden />
                {bookTitle(book)}
              </a>
            </Button>
          ))}
        </div>
      )}

      <div className="mt-5 space-y-2 border-t pt-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">For your accountant</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Each book lists the date, the customer&apos;s name and full ID number, the order number, the gross
            sale, the VAT exempted, the VAT-exempt sale, the 20% discount and the net amount — what RR 7-2010 and
            RR 5-2017 ask a restaurant to keep.
          </li>
          <li>
            When an order was changed or cancelled, the discount appears again as a negative line on that day,
            so the totals are already net.
          </li>
          <li>The daily summary adds the books up per day and per type, for the VAT return.</li>
          <li>
            WebNegosyo is not a BIR-accredited POS. These files are supporting records for your books, not
            official receipts or an accredited sales journal.
          </li>
        </ul>
      </div>
    </section>
  )
}
