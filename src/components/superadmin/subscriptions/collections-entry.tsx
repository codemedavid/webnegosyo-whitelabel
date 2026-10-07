'use client'

/**
 * One subscriber on the collections calendar: who, how much, why they are on
 * the list, and the two things the owner does next — ask (copy a reminder) or
 * record the money once it lands (Mark paid).
 */

import Link from 'next/link'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import type { CalendarEntry, CalendarEntryKind } from '@/lib/billing/collections-calendar'
import { buildPaymentReminder, formatDueDay } from '@/lib/billing/payment-reminder'

const peso = (value: number) => `₱${value.toLocaleString('en-PH')}`

/** Text colour per kind. Shared with the grid chips so a colour means one thing. */
export const KIND_INK: Record<CalendarEntryKind, string> = {
  overdue: 'text-red-300',
  due_today: 'text-amber-300',
  upcoming: 'text-sky-300',
  paid: 'text-emerald-300',
  never_billed: 'text-violet-300',
}

/** Chip/dot fill per kind. */
export const KIND_FILL: Record<CalendarEntryKind, string> = {
  overdue: 'bg-red-400/15',
  due_today: 'bg-amber-400/15',
  upcoming: 'bg-sky-400/10',
  paid: 'bg-emerald-400/10',
  never_billed: 'bg-violet-400/15',
}

export const KIND_DOT: Record<CalendarEntryKind, string> = {
  overdue: 'bg-red-400',
  due_today: 'bg-amber-300',
  upcoming: 'bg-sky-300',
  paid: 'bg-emerald-400',
  never_billed: 'bg-violet-300',
}

function statusLabel(entry: CalendarEntry): string {
  switch (entry.kind) {
    case 'overdue':
      return entry.daysLate === 1 ? '1 day late' : `${entry.daysLate} days late`
    case 'due_today':
      return 'Due today'
    case 'upcoming':
      return entry.dueDayKey ? `Due ${formatDueDay(entry.dueDayKey)}` : 'Upcoming'
    case 'paid':
      return 'Paid'
    case 'never_billed':
      return 'Billing not set up'
  }
}

const ACTION =
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-semibold text-white/75 transition-colors hover:border-white/25 hover:bg-white/[0.06] hover:text-white'

async function copyReminder(entry: CalendarEntry): Promise<void> {
  try {
    await navigator.clipboard.writeText(buildPaymentReminder(entry))
    toast.success(`Reminder for ${entry.name} copied`)
  } catch {
    toast.error('Could not copy — your browser blocked clipboard access')
  }
}

interface CollectionsEntryProps {
  entry: CalendarEntry
  onMarkPaid: (entry: CalendarEntry) => void
}

export function CollectionsEntry({ entry, onMarkPaid }: CollectionsEntryProps) {
  const isPaid = entry.kind === 'paid'

  return (
    <li
      className={`flex flex-col gap-2 rounded-xl border border-white/10 px-3 py-2.5 ${
        entry.isDormant && !isPaid ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/superadmin/tenants/${entry.tenantId}`}
            className="block truncate text-sm font-medium text-white hover:underline"
          >
            {entry.name}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            <span
              className={`rounded-full px-2 py-0.5 font-medium ${KIND_FILL[entry.kind]} ${KIND_INK[entry.kind]}`}
            >
              {statusLabel(entry)}
            </span>
            {entry.isFirstPayment && (
              <span className="rounded-full bg-violet-400/15 px-2 py-0.5 font-medium text-violet-300">
                First payment
              </span>
            )}
            {entry.isDormant && !isPaid && (
              <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-white/55">
                No orders in 30 days
              </span>
            )}
          </div>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-white">
          {peso(entry.amountPhp)}
        </span>
      </div>

      {!isPaid && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={ACTION} onClick={() => void copyReminder(entry)}>
            <Copy className="h-3.5 w-3.5" />
            Copy reminder
          </button>
          <button type="button" className={ACTION} onClick={() => onMarkPaid(entry)}>
            Mark paid
          </button>
        </div>
      )}
    </li>
  )
}
