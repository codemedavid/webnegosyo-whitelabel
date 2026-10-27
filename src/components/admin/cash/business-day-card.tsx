'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { setBusinessDayCutoffAction } from '@/app/actions/cash'
import { describeCutoff } from '@/lib/business-day/trading-day'
import { CUTOFF_CHOICES, CUTOFF_QUICK_CHOICES } from '@/lib/cash/cutoff'
import { cn } from '@/lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { SCHEDULE_FALLBACK_NOTE } from '@/lib/reports/schedule-fallback-note'
import { longDayLabel } from './cash-format'
import { CashNotice } from './cash-states'
import { FIELD_CLASS, PRIMARY_BUTTON, SettingsCard } from './settings-ui'

export interface BusinessDayCardProps {
  tenantSlug: string
  /** The cutoff in effect for today's business day. */
  currentMinutes: number
  /** A change already saved for a day that has not started. */
  pending: { effectiveFrom: string; cutoffMinutes: number } | null
  /** The day a change saved now would most likely start from (the server decides). */
  likelyStartDay: string
  canChange: boolean
  /** The schedule could not be read: showing midnight. */
  isFallback: boolean
}

function chipLabel(minutes: number): string {
  return minutes === 0 ? '12:00 AM (midnight)' : describeCutoff(minutes).label
}

/** "Business day ends at" with a live preview and an effective-date confirmation (UX §2). */
export function BusinessDayCard({ tenantSlug, currentMinutes, pending, likelyStartDay, canChange, isFallback }: BusinessDayCardProps) {
  const router = useRouter()
  const selectId = useId()
  const target = pending?.cutoffMinutes ?? currentMinutes
  const [chosen, setChosen] = useState(target)
  const [isConfirming, setIsConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const preview = describeCutoff(chosen)
  const isChanged = chosen !== target
  const isQuick = CUTOFF_QUICK_CHOICES.includes(chosen)

  function save(): void {
    setError(null)
    startTransition(async () => {
      const result = await setBusinessDayCutoffAction(tenantSlug, { cutoffMinutes: chosen })
      setIsConfirming(false)
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success(`From ${longDayLabel(result.data.effectiveFrom)}, your business day ends at ${chipLabel(chosen)}. Past days keep their dates.`)
      router.refresh()
    })
  }

  return (
    <SettingsCard
      id="business-day"
      title="Business day ends at"
      description="When one day’s sales stop and the next day’s start. Shifts, remittances and the day close follow it."
    >
      {isFallback && (
        <CashNotice>{SCHEDULE_FALLBACK_NOTE} Reload to try again; it can’t be changed until it loads.</CashNotice>
      )}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Business day ends at">
        {CUTOFF_QUICK_CHOICES.map((minutes) => (
          <button
            key={minutes}
            type="button"
            role="radio"
            aria-checked={chosen === minutes}
            disabled={!canChange || isPending}
            onClick={() => setChosen(minutes)}
            className={cn(
              'min-h-10 rounded-full px-4 text-[13.5px] font-bold ring-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-wn-ink disabled:cursor-not-allowed disabled:opacity-60',
              chosen === minutes ? 'bg-wn-ink text-white ring-wn-ink' : 'bg-white text-wn-ink ring-border hover:ring-wn-ink',
            )}
          >
            {chipLabel(minutes)}
          </button>
        ))}
        <label htmlFor={selectId} className="sr-only">
          Another time
        </label>
        <select
          id={selectId}
          value={isQuick ? '' : String(chosen)}
          disabled={!canChange || isPending}
          onChange={(event) => event.target.value !== '' && setChosen(Number(event.target.value))}
          className={cn(FIELD_CLASS, 'rounded-full font-bold')}
        >
          <option value="">Another time…</option>
          {CUTOFF_CHOICES.filter((minutes) => !CUTOFF_QUICK_CHOICES.includes(minutes)).map((minutes) => (
            <option key={minutes} value={minutes}>
              {chipLabel(minutes)}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-xl bg-wn-sand px-4 py-3 ring-1 ring-wn-line" aria-live="polite">
        <p className="text-[14px] font-bold text-wn-ink tabular-nums">{preview.example}</p>
        <p className="mt-1 text-[13px] leading-snug text-wn-stone">
          A shift belongs to the day it started. A 6 PM–3 AM shift is all one day, even the part after midnight.
        </p>
      </div>

      {pending && (
        <p className="text-[13.5px] text-wn-ink">
          From <b>{longDayLabel(pending.effectiveFrom)}</b> the day ends at <b>{chipLabel(pending.cutoffMinutes)}</b>. Today still ends at{' '}
          {chipLabel(currentMinutes)}.
        </p>
      )}

      {error && (
        <p role="alert" className="text-[13.5px] font-medium text-red-700">
          {error}
        </p>
      )}

      {canChange ? (
        <div>
          <button type="button" disabled={!isChanged || isPending} onClick={() => setIsConfirming(true)} className={PRIMARY_BUTTON}>
            Change to {chipLabel(chosen)}
          </button>
        </div>
      ) : (
        <p className="text-[13px] text-wn-stone">Only the owner or someone with Settings can change this.</p>
      )}

      <AlertDialog open={isConfirming} onOpenChange={(isOpen) => !isPending && setIsConfirming(isOpen)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End the business day at {chipLabel(chosen)}?</AlertDialogTitle>
            <AlertDialogDescription>
              Starts from {longDayLabel(likelyStartDay)}. Past days keep their dates, so reports you have already read don’t change.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault()
                save()
              }}
            >
              {isPending ? 'Saving…' : 'Yes, change it'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsCard>
  )
}
