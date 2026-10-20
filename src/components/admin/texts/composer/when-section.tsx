'use client'

import { Clock } from 'lucide-react'
import { useId } from 'react'
import { Input } from '@/components/ui/input'
import type { WhenChoice } from '@/lib/texts/types'
import { MAX_REPEAT_DAYS, type ComposerDraft, type RepeatKind } from '@/lib/texts/view/composer-draft'
import { addDays, manilaToday } from '@/lib/texts/view/time'
import { cn } from '@/lib/utils'
import { RadioChips } from '../radio-chips'
import { useTexts } from '../texts-context'
import { ComposerSection } from './composer-section'
import { TimePicker } from './time-picker'

const WHEN_OPTIONS: readonly { value: WhenChoice; label: string; description: string }[] = [
  { value: 'now', label: 'Now', description: 'When you confirm' },
  { value: 'later', label: 'Later', description: 'Pick a day' },
  { value: 'repeat', label: 'Repeat', description: 'On a schedule' },
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
  isDone?: boolean
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
            className={cn('h-11 w-12 rounded-full border text-sm font-medium transition-colors sm:h-10', isOn ? 'border-wn-ink bg-wn-ink text-white' : 'border-border bg-white hover:border-stone-400')}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

export function WhenSection({ draft, onChange, problem, finish, isDone = false }: WhenSectionProps) {
  const { rules } = useTexts()
  const ids = { date: useId(), every: useId(), ends: useId(), problem: useId() }
  const today = manilaToday(Date.now())
  const describedBy = problem ? ids.problem : undefined

  return (
    <ComposerSection id="composer-when" step={3} title="When" isDone={isDone} isLast>
      <RadioChips label="When it goes out" size="card" options={WHEN_OPTIONS} value={draft.when} onChange={(when) => onChange({ when })} className="grid grid-cols-3" />
      {draft.when === 'later' && (
        <div className="space-y-4 rounded-2xl border border-wn-line bg-wn-sand/50 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={ids.date} className="w-16 text-sm text-wn-stone">Day</label>
            <Input id={ids.date} type="date" min={today} value={draft.laterDate} onChange={(event) => onChange({ laterDate: event.target.value })} className="h-11 w-44 bg-white sm:h-10" aria-describedby={describedBy} />
          </div>
          <TimePicker value={draft.time} onChange={(time) => onChange({ time })} describedBy={describedBy} />
        </div>
      )}
      {draft.when === 'repeat' && (
        <div className="space-y-4 rounded-2xl border border-wn-line bg-wn-sand/50 p-4">
          <RadioChips label="How often" options={REPEAT_OPTIONS} value={draft.repeatKind} onChange={(repeatKind) => onChange({ repeatKind })} />
          {draft.repeatKind === 'weekly' ? (
            <Weekdays value={draft.weekdays} onChange={(weekdays) => onChange({ weekdays })} />
          ) : (
            <div className="flex items-center gap-2">
              <label htmlFor={ids.every} className="text-sm text-wn-stone">Every</label>
              <Input id={ids.every} type="number" min={1} max={90} value={draft.intervalDays} onChange={(event) => onChange({ intervalDays: Math.floor(Number(event.target.value)) })} className="h-11 w-20 bg-white tabular-nums sm:h-10" />
              <span className="text-sm text-wn-stone">days</span>
            </div>
          )}
          <TimePicker value={draft.time} onChange={(time) => onChange({ time })} describedBy={describedBy} />
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={ids.ends} className="text-sm text-wn-stone">Stop on</label>
            <Input id={ids.ends} type="date" required min={today} max={addDays(today, MAX_REPEAT_DAYS)} value={draft.endsOn} onChange={(event) => onChange({ endsOn: event.target.value })} className="h-11 w-44 bg-white sm:h-10" aria-describedby={describedBy} />
          </div>
          <p className="text-xs text-wn-stone">Each guest still gets at most one text every {rules.guestCapDays === 1 ? 'day' : `${rules.guestCapDays} days`}.</p>
        </div>
      )}
      {problem && <p id={ids.problem} role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-800">{problem}</p>}
      <div aria-live="polite">
        {finish && (
          <div className="flex gap-3 rounded-2xl border border-wn-line bg-white p-4 text-sm">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-wn-stone" aria-hidden="true" />
            <div className="space-y-1 tabular-nums">
              <p>{finish.text}</p>
              {finish.queueNote && <p className="text-wn-stone">{finish.queueNote}</p>}
            </div>
          </div>
        )}
      </div>
    </ComposerSection>
  )
}
