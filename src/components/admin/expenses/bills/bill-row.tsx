'use client'

import { AlarmClock, CalendarDays, CircleAlert, CircleCheck, Clock, Link2, MoreHorizontal, Pause, PencilLine, Play, Square, Undo2, X, type LucideIcon } from 'lucide-react'
import { isBillPaused, ruleSentence, type Bill } from '@/lib/expenses/bill-schedule'
import type { ExpenseCategory } from '@/lib/expenses/types'
import { cn } from '@/lib/utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { CategoryBadge } from '../expense-badges'
import { amountWords, canSnooze, dueWords, isOpen, lateCountWords, shortDate, type BoardRow, type DueTone } from './bill-board-model'

export type BillRowAction = 'pay' | 'link' | 'snooze' | 'skip' | 'undo_skip' | 'edit' | 'pause' | 'resume' | 'stop'

const TONE_CLASS: Readonly<Record<DueTone, string>> = {
  late: 'bg-red-50 text-red-800 ring-red-200',
  soon: 'bg-amber-50 text-amber-900 ring-amber-200',
  calm: 'bg-wn-sand text-wn-stone ring-wn-line',
  done: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
}

const TONE_ICON: Readonly<Record<DueTone, LucideIcon>> = {
  late: CircleAlert,
  soon: Clock,
  calm: CalendarDays,
  done: CircleCheck,
}

/** Words + an icon + a colour: colour is never the only signal. */
export function DuePill({ text, tone, icon }: { text: string; tone: DueTone; icon?: LucideIcon }) {
  const Icon = icon ?? TONE_ICON[tone]
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-bold ring-1', TONE_CLASS[tone])}>
      <Icon className="size-3.5" aria-hidden />
      {text}
    </span>
  )
}

const MENU_ITEM = 'min-h-10 cursor-pointer gap-2 px-2.5 text-[14px]'

interface MoreMenuProps {
  bill: Bill
  /** Paused right now (the engine's `isBillPaused`): offer Resume instead of Pause. */
  isPaused: boolean
  canLink: boolean
  canSnoozeRow: boolean
  canSkip: boolean
  isBusy: boolean
  onAction: (action: BillRowAction) => void
}

function MoreMenu({ bill, isPaused, canLink, canSnoozeRow, canSkip, isBusy, onAction }: MoreMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={isBusy}
        aria-label={`More for ${bill.name}`}
        className="grid size-10 shrink-0 place-items-center rounded-full text-wn-ink outline-none hover:bg-wn-sand focus-visible:ring-2 focus-visible:ring-wn-ink disabled:opacity-50"
      >
        <MoreHorizontal className="size-5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56 rounded-xl p-1">
        {canLink && (
          <DropdownMenuItem className={MENU_ITEM} onSelect={() => onAction('link')}>
            <Link2 aria-hidden />I already recorded it
          </DropdownMenuItem>
        )}
        {canSnoozeRow && (
          <DropdownMenuItem className={MENU_ITEM} onSelect={() => onAction('snooze')}>
            <AlarmClock aria-hidden />
            Remind me tomorrow
          </DropdownMenuItem>
        )}
        {canSkip && (
          <DropdownMenuItem className={MENU_ITEM} onSelect={() => onAction('skip')}>
            <X aria-hidden />
            Nothing to pay this time
          </DropdownMenuItem>
        )}
        {(canLink || canSnoozeRow || canSkip) && <DropdownMenuSeparator />}
        <DropdownMenuItem className={MENU_ITEM} onSelect={() => onAction('edit')}>
          <PencilLine aria-hidden />
          Edit bill
        </DropdownMenuItem>
        <DropdownMenuItem className={MENU_ITEM} onSelect={() => onAction(isPaused ? 'resume' : 'pause')}>
          {isPaused ? <Play aria-hidden /> : <Pause aria-hidden />}
          {isPaused ? 'Resume bill' : 'Pause bill'}
        </DropdownMenuItem>
        <DropdownMenuItem className={MENU_ITEM} onSelect={() => onAction('stop')}>
          <Square aria-hidden />
          Stop bill
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface BillRowProps {
  row: BoardRow
  category: ExpenseCategory | undefined
  /** "Whole store" / the branch, on a multi-branch store; else null. */
  branchName: string | null
  today: string
  isBusy: boolean
  onAction: (action: BillRowAction, row: BoardRow) => void
}

export function BillRow({ row, category, branchName, today, isBusy, onAction }: BillRowProps) {
  const { bill, occurrence } = row
  const due = dueWords(occurrence, today, bill.rule.kind)
  const isRowOpen = isOpen(occurrence)
  const isSkipped = occurrence.state === 'skipped'
  const lateLine = lateCountWords(occurrence)
  const act = (action: BillRowAction) => onAction(action, row)
  const details = [ruleSentence(bill.rule, bill.startsOn), branchName].filter(Boolean).join(' · ')

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-5">
      <CategoryBadge category={category} size="lg" />
      <div className="min-w-0 flex-1 basis-40">
        <p className="truncate text-[15px] font-bold text-wn-ink">{bill.name}</p>
        <p className="truncate text-[13px] text-wn-stone">{details}</p>
        {lateLine && <p className="text-[12.5px] font-semibold text-red-800">{lateLine}</p>}
      </div>
      <div className="flex flex-col items-start gap-1 sm:items-end">
        <DuePill text={due.text} tone={due.tone} icon={occurrence.state === 'snoozed' ? AlarmClock : undefined} />
        <p className={cn('text-[15px] font-bold tabular-nums text-wn-ink', isSkipped && 'font-medium text-wn-stone line-through')}>
          {amountWords(occurrence)}
        </p>
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        {isRowOpen && (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => act('pay')}
            aria-label={`Mark paid: ${bill.name}`}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-wn-ink px-4 text-[13.5px] font-bold text-white outline-none hover:bg-wn-ink-raised focus-visible:ring-2 focus-visible:ring-wn-ink focus-visible:ring-offset-2 disabled:opacity-60"
          >
            <CircleCheck className="size-4" aria-hidden />
            Mark paid
          </button>
        )}
        {isSkipped && (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => act('undo_skip')}
            aria-label={`Undo nothing to pay for ${bill.name} on ${shortDate(occurrence.dueOn)}`}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-4 text-[13.5px] font-bold text-wn-ink ring-1 ring-wn-line outline-none hover:ring-wn-ink focus-visible:ring-2 focus-visible:ring-wn-ink disabled:opacity-60"
          >
            <Undo2 className="size-4" aria-hidden />
            Undo
          </button>
        )}
        <MoreMenu
          bill={bill}
          isPaused={isBillPaused(bill, today)}
          canLink={isRowOpen}
          canSnoozeRow={canSnooze(occurrence, today)}
          canSkip={isRowOpen}
          isBusy={isBusy}
          onAction={act}
        />
      </div>
    </li>
  )
}

interface PausedRowProps {
  bill: Bill
  category: ExpenseCategory | undefined
  isBusy: boolean
  onAction: (action: BillRowAction, bill: Bill) => void
}

/** A paused bill: no reminders until resumed (or its resume date). */
export function PausedBillRow({ bill, category, isBusy, onAction }: PausedRowProps) {
  const until = bill.pausedUntil ? `Paused until ${shortDate(bill.pausedUntil)}` : 'Paused'
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-5">
      <CategoryBadge category={category} size="lg" />
      <div className="min-w-0 flex-1 basis-40">
        <p className="truncate text-[15px] font-bold text-wn-ink">{bill.name}</p>
        <p className="truncate text-[13px] text-wn-stone">{ruleSentence(bill.rule, bill.startsOn)}</p>
      </div>
      <DuePill text={until} tone="calm" icon={Pause} />
      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onAction('resume', bill)}
          aria-label={`Resume ${bill.name}`}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-4 text-[13.5px] font-bold text-wn-ink ring-1 ring-wn-line outline-none hover:ring-wn-ink focus-visible:ring-2 focus-visible:ring-wn-ink disabled:opacity-60"
        >
          <Play className="size-4" aria-hidden />
          Resume
        </button>
        <MoreMenu bill={bill} isPaused canLink={false} canSnoozeRow={false} canSkip={false} isBusy={isBusy} onAction={(action) => onAction(action, bill)} />
      </div>
    </li>
  )
}

/** A stopped bill: read-only, its payments live on in Expenses. */
export function StoppedBillRow({ bill, category }: { bill: Bill; category: ExpenseCategory | undefined }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <CategoryBadge category={category} size="lg" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-bold text-wn-stone">{bill.name}</p>
        <p className="truncate text-[13px] text-wn-stone">{ruleSentence(bill.rule, bill.startsOn)}</p>
      </div>
      <DuePill text="Stopped" tone="calm" icon={Square} />
    </li>
  )
}
