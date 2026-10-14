'use client'

import { useId } from 'react'
import { Input } from '@/components/ui/input'
import type { WhenChoice } from '@/lib/texts/types'
import { MAX_REPEAT_DAYS, quietNote, type ComposerDraft, type RepeatKind } from '@/lib/texts/view/composer-draft'
import { addDays, manilaToday } from '@/lib/texts/view/time'
import { cn } from '@/lib/utils'
import { RadioChips } from '../radio-chips'
import { useTexts } from '../texts-context'
import { ComposerSection } from './composer-section'
import { TimePicker } from './time-picker'

const WHEN_OPTIONS: readonly { value: WhenChoice; label: string }[] = [
  { value: 'now', label: 'Now' },
  { value: 'later', label: 'Later' },
  { value: 'repeat', label: 'Repeat' },
]
const REPEAT_OPTIONS: readonly { value: RepeatKind; label: string }[] = [
  { value: 'weekly', label: 'Every week' },
  { value: 'every_n_days', label: 'Every few days' },
]
const WEEKDAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [7, 'Sun']] as const

interface WhenSectionProps {
  draft: ComposerDraft
  onChange: (patch: Partial<ComposerDraft>) => void
  problem: string | null
  finish: { text: string; queueNote: string | null } | null
}

function Weekdays({ value, onChange }: { value: number[]; onChange: (days: number[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days of the week">
      {WEEKDAYS.map(([day, label]) => {
        const isOn = value.includes(day)
        return (
          <button
            key={day}
            type="button"
            aria-pressed={isOn}
            onClick={() => onChange(isOn ? value.filter((d) => d !== day) : [...value, day])}
            className={cn('h-11 w-12 rounded-full border text-sm font-medium sm:h-9', isOn ? 'border-foreground bg-foreground text-background' : 'hover:bg-muted/40')}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

export function WhenSection({ draft, onChange, problem, finish }: WhenSectionProps) {
  const { rules } = useTexts()
  const ids = { date: useId(), every: useId(), ends: useId(), problem: useId() }
  const today = manilaToday(Date.now())
  const note = draft.when !== 'now' ? quietNote(draft.time, rules) : null

  return (
    <ComposerSection id="composer-when" step={3} title="When">
      <RadioChips label="When it goes out" options={WHEN_OPTIONS} value={draft.when} onChange={(when) => onChange({ when })} />
      {draft.when === 'later' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <label htmlFor={ids.date} className="text-sm">Day</label>
            <Input id={ids.date} type="date" min={today} value={draft.laterDate} onChange={(event) => onChange({ laterDate: event.target.value })} className="h-11 w-44 sm:h-9" aria-describedby={problem ? ids.problem : undefined} />
          </div>
          <TimePicker value={draft.time} onChange={(time) => onChange({ time })} />
        </div>
      )}
      {draft.when === 'repeat' && (
        <div className="space-y-3">
          <RadioChips label="How often" options={REPEAT_OPTIONS} value={draft.repeatKind} onChange={(repeatKind) => onChange({ repeatKind })} />
          {draft.repeatKind === 'weekly' ? (
            <Weekdays value={draft.weekdays} onChange={(weekdays) => onChange({ weekdays })} />
          ) : (
            <div className="flex items-center gap-2">
              <label htmlFor={ids.every} className="text-sm">Every</label>
              <Input id={ids.every} type="number" min={1} max={90} value={draft.intervalDays} onChange={(event) => onChange({ intervalDays: Math.floor(Number(event.target.value)) })} className="h-11 w-20 tabular-nums sm:h-9" />
              <span className="text-sm">days</span>
            </div>
          )}
          <TimePicker value={draft.time} onChange={(time) => onChange({ time })} />
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={ids.ends} className="text-sm">Stop on</label>
            <Input id={ids.ends} type="date" required min={today} max={addDays(today, MAX_REPEAT_DAYS)} value={draft.endsOn} onChange={(event) => onChange({ endsOn: event.target.value })} className="h-11 w-44 sm:h-9" aria-describedby={problem ? ids.problem : undefined} />
          </div>
          <p className="text-xs text-muted-foreground">Each guest still gets at most one text every {rules.guestCapDays === 1 ? 'day' : `${rules.guestCapDays} days`}.</p>
        </div>
      )}
      {draft.when === 'now' && <p className="text-sm text-muted-foreground">It starts as soon as you confirm.</p>}
      {note && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">{note}</p>}
      {problem && <p id={ids.problem} role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{problem}</p>}
      <div aria-live="polite" className="space-y-1 text-sm text-muted-foreground tabular-nums">
        {finish && <p>{finish.text}</p>}
        {finish?.queueNote && <p>{finish.queueNote}</p>}
      </div>
    </ComposerSection>
  )
}
