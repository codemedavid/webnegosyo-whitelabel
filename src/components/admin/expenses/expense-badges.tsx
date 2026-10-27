import { Banknote, CalendarClock, CreditCard, HandCoins, Inbox, Landmark, Smartphone, TriangleAlert, Ban, type LucideIcon } from 'lucide-react'
import type { ExpenseCategory, ExpenseFlag, PaidFrom } from '@/lib/expenses/types'
import { cn } from '@/lib/utils'
import { PAID_FROM_LABELS } from './expense-format'

/** The round category badge: the category's short code ("LP"), never an emoji (plan §5.6). */
export function CategoryBadge({ category, size = 'md' }: { category: Pick<ExpenseCategory, 'icon' | 'name'> | undefined; size?: 'sm' | 'md' | 'lg' }) {
  const code = (category?.icon?.trim() || category?.name?.trim().slice(0, 2) || '?').toUpperCase()
  return (
    <span
      aria-hidden
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-[9px] bg-wn-sand font-bold tabular-nums text-wn-stone ring-1 ring-wn-line',
        size === 'sm' && 'size-6 text-[10px]',
        size === 'md' && 'size-7 text-[11px]',
        size === 'lg' && 'size-10 rounded-xl text-[13px]',
      )}
    >
      {code}
    </span>
  )
}

const PAID_FROM_ICONS: Readonly<Record<PaidFrom, LucideIcon>> = {
  drawer: Inbox,
  cash: Banknote,
  gcash: Smartphone,
  maya: Smartphone,
  bank: Landmark,
  card: CreditCard,
  owner: HandCoins,
}

/** The small till badge every drawer row carries. */
export function TillBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-wn-ink/[0.07] px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.04em] text-wn-ink">
      <Inbox className="size-3" aria-hidden />
      Drawer
    </span>
  )
}

/** "Bank", "GCash", or the till badge for a drawer pay-out. */
export function PaidFromLabel({ paidFrom }: { paidFrom: PaidFrom }) {
  if (paidFrom === 'drawer') return <TillBadge />
  const Icon = PAID_FROM_ICONS[paidFrom]
  return (
    <span className="inline-flex items-center gap-1.5 text-wn-ink">
      <Icon className="size-3.5 text-wn-stone" aria-hidden />
      {PAID_FROM_LABELS[paidFrom]}
    </span>
  )
}

export function PaidFromIcon({ paidFrom, className }: { paidFrom: PaidFrom; className?: string }) {
  const Icon = PAID_FROM_ICONS[paidFrom]
  return <Icon className={className} aria-hidden />
}

/** Words for each flag, shown with an icon so colour is never the only signal. */
export const FLAG_WORDS: Readonly<Record<ExpenseFlag, string>> = {
  no_receipt: 'No receipt',
  possible_duplicate: 'Possible duplicate',
  round_other: 'Round “Other”',
  after_hours_void: 'Voided after hours',
}

export function FlagChip({ flag }: { flag: ExpenseFlag }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11.5px] font-semibold text-amber-900 ring-1 ring-amber-200">
      <TriangleAlert className="size-3" aria-hidden />
      {FLAG_WORDS[flag]}
    </span>
  )
}

export function VoidChip({ reason }: { reason: string | null }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 text-[12px] font-semibold text-wn-stone">
      <Ban className="size-3 shrink-0" aria-hidden />
      <span className="truncate">Voided{reason ? ` · ${reason}` : ''}</span>
    </span>
  )
}

/** A payment of a bill (Bills to pay): "Bill", with the bill's name for the tooltip and screen readers. */
export function BillBadge({ name }: { name: string | null }) {
  const title = name ? `Pays the bill: ${name}` : 'Pays a bill'
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full bg-wn-sand px-2 py-0.5 text-[11.5px] font-semibold text-wn-ink ring-1 ring-wn-line"
    >
      <CalendarClock className="size-3" aria-hidden />
      Bill
      <span className="sr-only">{name ? `: ${name}` : ''}</span>
    </span>
  )
}

export function NotExpenseChip() {
  return (
    <span className="inline-flex items-center rounded-full bg-wn-sand px-2 py-0.5 text-[11px] font-semibold text-wn-stone ring-1 ring-wn-line">
      Not an expense
    </span>
  )
}
