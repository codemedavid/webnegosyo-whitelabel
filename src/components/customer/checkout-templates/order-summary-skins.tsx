import type { ReactNode } from 'react'
import { Separator } from '@/components/ui/separator'

/**
 * The order summary's skins: one set of rows (order-summary-lines.tsx), drawn
 * with different spacing, type and rules. `default` and `classic` are the
 * standard checkouts'; `receipt` and `compact` are offered by the Page
 * Designer's summary block only.
 */

export type OrderSummaryVariant = 'default' | 'classic' | 'receipt' | 'compact'

export interface SummarySkin {
  container: string
  /** Rule between two line items. */
  itemBreak: ReactNode
  /** Rule below the last line item. */
  itemsBreak: ReactNode
  /** Rule below each totals row (classic punctuates every row). */
  rowTrailingBreak: ReactNode
  /** Rule above the voucher field / discount / total (default punctuates groups). */
  voucherLeadingBreak: ReactNode
  discountLeadingBreak: ReactNode
  totalLeadingBreak: ReactNode
  itemName: string
  itemMeta: string
  itemAddons: string
  itemNote: string
  itemPrice: string
  rowLabel: string
  rowValue: string
  discountValue: string
  errorText: string
  totalRow: string
  totalLabel: string
  totalValue: string
}

const RULE = 'border-t border-[color:var(--co-border)]'
const SEPARATOR_COLOR = 'bg-[var(--co-border)]'

const DEFAULT_SKIN: SummarySkin = {
  container: 'space-y-3',
  itemBreak: <div className={`my-3 ${RULE}`} />,
  itemsBreak: <div className={`my-3 ${RULE}`} />,
  rowTrailingBreak: null,
  voucherLeadingBreak: <div className={`my-2 ${RULE}`} />,
  discountLeadingBreak: null,
  totalLeadingBreak: <div className={`my-2 ${RULE}`} />,
  itemName: 'font-medium text-sm text-[color:var(--co-text)]',
  itemMeta: 'text-xs text-[color:var(--co-muted)]',
  itemAddons: 'text-xs text-[color:var(--co-muted)] mt-0.5',
  itemNote: 'min-w-0 wrap-anywhere text-xs italic text-[color:var(--co-muted)] mt-0.5',
  itemPrice: 'font-semibold text-sm text-[color:var(--co-text)] flex-shrink-0',
  rowLabel: 'text-[color:var(--co-muted)]',
  rowValue: 'font-medium text-[color:var(--co-text)]',
  discountValue: 'font-medium text-[color:var(--co-success)]',
  errorText: 'text-xs text-[color:var(--co-error)]',
  totalRow: 'flex justify-between items-baseline',
  totalLabel: 'text-base font-bold text-[color:var(--co-text)]',
  totalValue: 'text-xl font-bold',
}

const CLASSIC_SKIN: SummarySkin = {
  container: 'space-y-4',
  itemBreak: <Separator className={`my-4 ${SEPARATOR_COLOR}`} />,
  itemsBreak: <Separator className={`my-4 ${SEPARATOR_COLOR}`} />,
  rowTrailingBreak: <Separator className={`my-2 ${SEPARATOR_COLOR}`} />,
  voucherLeadingBreak: null,
  discountLeadingBreak: <Separator className={`my-2 ${SEPARATOR_COLOR}`} />,
  totalLeadingBreak: null,
  itemName: 'font-medium text-[color:var(--co-text)]',
  itemMeta: 'text-sm text-[color:var(--co-muted)]',
  itemAddons: 'text-sm text-[color:var(--co-muted)]',
  itemNote: 'min-w-0 wrap-anywhere text-sm italic text-[color:var(--co-muted)]',
  itemPrice: 'font-semibold text-[color:var(--co-text)] flex-shrink-0',
  rowLabel: 'text-[color:var(--co-muted)]',
  rowValue: 'font-semibold text-[color:var(--co-text)]',
  discountValue: 'font-semibold text-[color:var(--co-success)]',
  errorText: 'text-sm text-[color:var(--co-error)]',
  totalRow: `flex justify-between text-xl font-bold pt-4 ${RULE}`,
  totalLabel: '',
  totalValue: 'text-[color:var(--co-accent)]',
}

const DASHED = 'border-t border-dashed border-[color:var(--co-border)]'

/** A till receipt: dashed rules, figures in columns, a big bold total. */
const RECEIPT_SKIN: SummarySkin = {
  container: 'space-y-2.5',
  itemBreak: null,
  itemsBreak: <div className={`my-3 ${DASHED}`} />,
  rowTrailingBreak: null,
  voucherLeadingBreak: <div className={`my-2 ${DASHED}`} />,
  discountLeadingBreak: null,
  totalLeadingBreak: <div className="my-3 border-t-2 border-dashed border-[color:var(--co-border)]" />,
  itemName: 'font-medium text-sm text-[color:var(--co-text)]',
  itemMeta: 'text-xs text-[color:var(--co-muted)]',
  itemAddons: 'text-xs text-[color:var(--co-muted)] mt-0.5',
  itemNote: 'min-w-0 wrap-anywhere text-xs italic text-[color:var(--co-muted)] mt-0.5',
  itemPrice: 'font-semibold text-sm tabular-nums text-[color:var(--co-text)] flex-shrink-0',
  rowLabel: 'text-[color:var(--co-muted)]',
  rowValue: 'font-medium tabular-nums text-[color:var(--co-text)]',
  discountValue: 'font-medium tabular-nums text-[color:var(--co-success)]',
  errorText: 'text-xs text-[color:var(--co-error)]',
  totalRow: 'flex justify-between items-baseline',
  totalLabel: 'text-lg font-extrabold uppercase tracking-wide text-[color:var(--co-text)]',
  totalValue: 'text-2xl font-extrabold tabular-nums',
}

/** Tighter rows for a long cart on a phone. */
const COMPACT_SKIN: SummarySkin = {
  container: 'space-y-2',
  itemBreak: null,
  itemsBreak: <div className={`my-2 ${RULE}`} />,
  rowTrailingBreak: null,
  voucherLeadingBreak: <div className={`my-1.5 ${RULE}`} />,
  discountLeadingBreak: null,
  totalLeadingBreak: <div className={`my-1.5 ${RULE}`} />,
  itemName: 'text-sm text-[color:var(--co-text)]',
  itemMeta: 'text-xs text-[color:var(--co-muted)]',
  itemAddons: 'text-xs text-[color:var(--co-muted)]',
  itemNote: 'min-w-0 wrap-anywhere text-xs italic text-[color:var(--co-muted)]',
  itemPrice: 'text-sm font-medium text-[color:var(--co-text)] flex-shrink-0',
  rowLabel: 'text-[color:var(--co-muted)]',
  rowValue: 'font-medium text-[color:var(--co-text)]',
  discountValue: 'font-medium text-[color:var(--co-success)]',
  errorText: 'text-xs text-[color:var(--co-error)]',
  totalRow: 'flex justify-between items-baseline',
  totalLabel: 'text-sm font-bold text-[color:var(--co-text)]',
  totalValue: 'text-lg font-bold',
}

export const SKINS: Record<OrderSummaryVariant, SummarySkin> = {
  default: DEFAULT_SKIN,
  classic: CLASSIC_SKIN,
  receipt: RECEIPT_SKIN,
  compact: COMPACT_SKIN,
}
