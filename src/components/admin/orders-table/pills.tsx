import { Bike, Package, ShoppingBag, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STATUS_META, type OrderStatus, type StatusTone } from '@/lib/admin/orders-table/status'
import { PAYMENT_CHIP_LABELS, type OrderKind, type PaymentChip } from '@/lib/admin/orders-table/row-model'

const TONE_CLASSES: Readonly<Record<StatusTone, string>> = {
  new: 'bg-wn-coral-wash text-wn-coral-deep ring-wn-coral/30',
  info: 'bg-sky-50 text-sky-800 ring-sky-200',
  warn: 'bg-amber-50 text-amber-900 ring-amber-200',
  ok: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  muted: 'bg-wn-sand text-wn-stone ring-wn-line',
  bad: 'bg-red-50 text-red-800 ring-red-200',
}

const PILL = 'inline-flex min-h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12.5px] font-bold ring-1'

export function StatusPill({ status, className }: { status: OrderStatus; className?: string }) {
  const meta = STATUS_META[status]
  return (
    <span className={cn(PILL, TONE_CLASSES[meta.tone], className)}>
      {status === 'pending' && <span aria-hidden className="size-1.5 rounded-full bg-wn-coral" />}
      {meta.label}
    </span>
  )
}

const PAYMENT_TONE: Readonly<Record<PaymentChip, StatusTone>> = {
  paid: 'ok',
  proof: 'warn',
  unpaid: 'muted',
  failed: 'bad',
  none: 'muted',
}

/** Nothing at all for `none`, so a cancelled row's money cell stays quiet. */
export function PaymentPill({ chip, className }: { chip: PaymentChip; className?: string }) {
  if (chip === 'none') return null
  return <span className={cn(PILL, 'min-h-5 px-2 text-[11.5px]', TONE_CLASSES[PAYMENT_TONE[chip]], className)}>{PAYMENT_CHIP_LABELS[chip]}</span>
}

const KIND_ICONS: Readonly<Record<OrderKind, LucideIcon>> = {
  dine_in: UtensilsCrossed,
  pickup: ShoppingBag,
  delivery: Bike,
  other: Package,
}

export function OrderKindIcon({ kind, className }: { kind: OrderKind | null; className?: string }) {
  const Icon = KIND_ICONS[kind ?? 'other']
  return <Icon aria-hidden className={cn('size-4 shrink-0 text-wn-stone', className)} />
}
