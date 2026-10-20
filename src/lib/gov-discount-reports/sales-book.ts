/**
 * The BIR supporting records: one sales book per discount kind, and a daily
 * summary.
 *
 * RR 7-2010 §7 and RR 5-2017 §5.9 ask the establishment to keep, per
 * discounted sale, the date, the claimant's name and ID number, the invoice
 * number, the gross sale and the discount. These books add the VAT columns
 * the accountant needs to reconcile the VAT return.
 *
 * Reversals are printed, not hidden: an edit or a cancellation appears as a
 * NEGATIVE line on the day it was recorded, with a remark. The book is a
 * journal — every line the register recorded, in order — and its totals equal
 * the net figures on the owner's screen. Deleting the original line instead
 * would make a month already handed to the accountant change under them.
 *
 * ID numbers are printed IN FULL: this is the record BIR asks for.
 */

import { GOV_DISCOUNT_KINDS, GOV_DISCOUNT_RULES, type GovDiscountKind } from '@/lib/gov-discount'
import { money, toCsv, type CsvValue } from './csv'
import { orderReference } from './format'
import { signOf, sumClaims } from './netting'
import { manilaDayKey, type ReportPeriod } from './period'
import type { LedgerClaim, MoneyTotals } from './types'

export type ExportBook = GovDiscountKind | 'summary'

export const EXPORT_BOOKS: readonly ExportBook[] = [...GOV_DISCOUNT_KINDS, 'summary']

export function isExportBook(value: unknown): value is ExportBook {
  return typeof value === 'string' && (EXPORT_BOOKS as readonly string[]).includes(value)
}

interface BookWording {
  title: string
  fileStem: string
  nameHeader: string
  idHeader: string
}

const BOOK_WORDING: Readonly<Record<GovDiscountKind, BookWording>> = {
  senior: {
    title: 'Senior Citizen sales book',
    fileStem: 'senior-citizen-sales-book',
    nameHeader: 'Name of Senior Citizen',
    idHeader: 'OSCA ID No.',
  },
  pwd: {
    title: 'PWD sales book',
    fileStem: 'pwd-sales-book',
    nameHeader: 'Name of PWD',
    idHeader: 'PWD ID No.',
  },
  athlete: {
    title: 'National Athlete / Coach sales book',
    fileStem: 'national-athlete-sales-book',
    nameHeader: 'Name of National Athlete / Coach',
    idHeader: 'PNSTM ID No.',
  },
  medal_of_valor: {
    title: 'Medal of Valor sales book',
    fileStem: 'medal-of-valor-sales-book',
    nameHeader: 'Name of Medal of Valor Awardee / Dependent',
    idHeader: 'ID No.',
  },
}

export function bookTitle(book: ExportBook): string {
  return book === 'summary' ? 'Daily summary' : BOOK_WORDING[book].title
}

export function bookFileName(book: ExportBook, period: Pick<ReportPeriod, 'fileTag'>): string {
  const stem = book === 'summary' ? 'senior-pwd-daily-summary' : BOOK_WORDING[book].fileStem
  return `${stem}_${period.fileTag}.csv`
}

/**
 * Senior and PWD sales are VAT-EXEMPT; athletes and Medal of Valor are sold
 * VAT-exclusive with VAT charged on what is left, so their columns are named
 * for what the figures really are.
 */
function vatHeaders(kind: GovDiscountKind): [string, string] {
  return GOV_DISCOUNT_RULES[kind].vatTreatment === 'exempt'
    ? ['VAT Exempted', 'VAT-Exempt Sales']
    : ['VAT Reduction', 'VAT-Exclusive Sales']
}

export function salesBookHeaders(kind: GovDiscountKind): string[] {
  const wording = BOOK_WORDING[kind]
  const [vatOff, vatBase] = vatHeaders(kind)
  return [
    'Date',
    wording.nameHeader,
    wording.idHeader,
    'Invoice/Order No.',
    'Gross Sales (VAT-inclusive)',
    vatOff,
    vatBase,
    `Discount (${GOV_DISCOUNT_RULES[kind].ratePercent}%)`,
    'Net Amount',
    'Cashier',
    'Approved by',
    'Remarks',
  ]
}

/** Oldest first — the order a book is written in. */
function chronological(rows: readonly LedgerClaim[]): LedgerClaim[] {
  return [...rows].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id))
}

function remarkFor(row: LedgerClaim): string {
  if (row.event === 'reversed') return 'Reversal: order changed or cancelled'
  return row.allocationMode === 'shared' && row.diners ? `Shared table of ${row.diners}` : ''
}

function amountCells(totals: Pick<MoneyTotals, 'grossShare' | 'vatRemoved' | 'vatExemptSales' | 'discount' | 'netDue'>): CsvValue[] {
  return [
    money(totals.grossShare),
    money(totals.vatRemoved),
    money(totals.vatExemptSales),
    money(totals.discount),
    money(totals.netDue),
  ]
}

function bookLine(row: LedgerClaim): CsvValue[] {
  const sign = signOf(row)
  return [
    manilaDayKey(new Date(row.occurredAt).getTime()),
    row.claimantName,
    row.idNumber,
    orderReference(row),
    ...amountCells({
      grossShare: sign * row.grossShare,
      vatRemoved: sign * row.vatRemoved,
      vatExemptSales: sign * row.vatExemptSales,
      discount: sign * row.discount,
      netDue: sign * row.netDue,
    }),
    row.grantedByName,
    row.approvedByName ?? '',
    remarkFor(row),
  ]
}

/** One kind's book for the period: every line, then a TOTAL line. */
export function buildSalesBookCsv(kind: GovDiscountKind, rows: readonly LedgerClaim[]): string {
  const lines = chronological(rows.filter((row) => row.kind === kind))
  const totals = sumClaims(lines)
  const totalLine: CsvValue[] = ['TOTAL', `${totals.sales} net sales`, '', '', ...amountCells(totals), '', '', '']
  return toCsv(salesBookHeaders(kind), [...lines.map(bookLine), totalLine])
}

export const SUMMARY_HEADERS = [
  'Date',
  'Type',
  'Sales (net)',
  'Gross Sales (VAT-inclusive)',
  'VAT Exempted / Reduced',
  'VAT-Exempt / Exclusive Sales',
  'Discount',
  'Net Amount',
  'Total taken off',
] as const

function summaryLine(date: string, type: string, totals: MoneyTotals): CsvValue[] {
  return [date, type, totals.sales, ...amountCells(totals), money(totals.reduction)]
}

/**
 * Per day and kind (only days with activity), then a total per kind and a
 * grand total. Days and totals are signed like the books.
 */
export function buildDailySummaryCsv(rows: readonly LedgerClaim[]): string {
  const ordered = chronological(rows)
  const byDayKind = new Map<string, LedgerClaim[]>()
  for (const row of ordered) {
    const key = `${manilaDayKey(new Date(row.occurredAt).getTime())}|${row.kind}`
    byDayKind.set(key, [...(byDayKind.get(key) ?? []), row])
  }
  const kindRank = (kind: string) => GOV_DISCOUNT_KINDS.indexOf(kind as GovDiscountKind)
  const dayLines = [...byDayKind.entries()]
    .map(([key, members]) => {
      const [day, kind] = key.split('|') as [string, GovDiscountKind]
      return { day, kind, totals: sumClaims(members) }
    })
    .sort((a, b) => a.day.localeCompare(b.day) || kindRank(a.kind) - kindRank(b.kind))
    .map(({ day, kind, totals }) => summaryLine(day, GOV_DISCOUNT_RULES[kind].code, totals))

  const kindTotals = GOV_DISCOUNT_KINDS.filter((kind) => ordered.some((row) => row.kind === kind)).map((kind) =>
    summaryLine('TOTAL', GOV_DISCOUNT_RULES[kind].code, sumClaims(ordered.filter((row) => row.kind === kind))),
  )
  const grandTotal = summaryLine('TOTAL', 'ALL', sumClaims(ordered))
  return toCsv(SUMMARY_HEADERS, [...dayLines, ...kindTotals, grandTotal])
}

/** The kinds that have at least one line in the period, in register order. */
export function kindsWithLines(rows: readonly LedgerClaim[]): GovDiscountKind[] {
  const present = new Set(rows.map((row) => row.kind))
  return GOV_DISCOUNT_KINDS.filter((kind) => present.has(kind))
}

export function buildExportCsv(book: ExportBook, rows: readonly LedgerClaim[]): string {
  return book === 'summary' ? buildDailySummaryCsv(rows) : buildSalesBookCsv(book, rows)
}
