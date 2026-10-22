'use client'

import type { ReactNode } from 'react'
import { ruleSentence, type DayOfMonth } from '@/lib/expenses/bill-schedule'
import { cn } from '@/lib/utils'
import { FIELD_INPUT, FIELD_LABEL, FieldError } from '../expense-form-fields'
import { dayLabel } from '../expense-format'
import {
  DAY_OPTIONS,
  MONTHS_EVERY_OPTIONS,
  REPEAT_OPTIONS,
  WEEKDAY_NAMES,
  dayOptionLabel,
  ruleOf,
  type BillEditorState,
  type MonthsEvery,
  type RepeatChoice,
} from './bill-editor-model'

interface SelectFieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
  error?: string | null
  className?: string
}

/** A native select: arrow keys, type-ahead and the phone's own picker, for free. */
export function SelectField({ id, label, value, onChange, children, error, className }: SelectFieldProps) {
  const errorId = `${id}-error`
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className={FIELD_LABEL}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={cn(FIELD_INPUT, 'appearance-auto pr-2')}
      >
        {children}
      </select>
      <FieldError id={errorId} message={error} />
    </div>
  )
}

const dayValue = (day: DayOfMonth): string => String(day)
const dayFrom = (value: string): DayOfMonth => (value === 'last' ? 'last' : Number(value))

function DaySelect({ id, label, value, onChange }: { id: string; label: string; value: DayOfMonth; onChange: (day: DayOfMonth) => void }) {
  return (
    <SelectField id={id} label={label} value={dayValue(value)} onChange={(next) => onChange(dayFrom(next))}>
      {DAY_OPTIONS.map((day) => (
        <option key={dayValue(day)} value={dayValue(day)}>
          {dayOptionLabel(day)}
        </option>
      ))}
    </SelectField>
  )
}

interface HowOftenFieldsProps {
  idPrefix: string
  state: BillEditorState
  onChange: (patch: Partial<BillEditorState>) => void
  error?: string | null
  /** The next three due dates for what is picked ([] while it can't be read). */
  preview: readonly string[]
  today: string
}

/** "How often": one plain sentence, the day it falls on, then the next three dates to prove it. */
export function HowOftenFields({ idPrefix, state, onChange, error, preview, today }: HowOftenFieldsProps) {
  const repeat = state.repeat
  const usesDay = repeat === 'monthly' || repeat === 'twice_monthly' || repeat === 'months' || repeat === 'yearly'
  const usesWeekday = repeat === 'weekly' || repeat === 'every_2_weeks'
  const everyDaysId = `${idPrefix}-every-days`
  const previewId = `${idPrefix}-preview`
  return (
    <fieldset className="flex flex-col gap-3 rounded-xl bg-wn-sand/60 p-3.5 ring-1 ring-wn-line">
      <legend className="sr-only">How often</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          id={`${idPrefix}-repeat`}
          label="How often"
          value={repeat}
          onChange={(value) => onChange({ repeat: value as RepeatChoice })}
          error={repeat === 'after_days' ? null : error}
        >
          {REPEAT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>

        {repeat === 'months' && (
          <SelectField
            id={`${idPrefix}-months-every`}
            label="Every"
            value={String(state.monthsEvery)}
            onChange={(value) => onChange({ monthsEvery: Number(value) as MonthsEvery })}
          >
            {MONTHS_EVERY_OPTIONS.map((every) => (
              <option key={every} value={every}>
                {every} months
              </option>
            ))}
          </SelectField>
        )}

        {usesDay && (
          <DaySelect
            id={`${idPrefix}-day`}
            label={repeat === 'twice_monthly' ? 'First day' : 'On the'}
            value={state.day}
            onChange={(day) => onChange({ day })}
          />
        )}
        {repeat === 'twice_monthly' && (
          <DaySelect id={`${idPrefix}-second-day`} label="Second day" value={state.secondDay} onChange={(secondDay) => onChange({ secondDay })} />
        )}

        {usesWeekday && (
          <SelectField id={`${idPrefix}-weekday`} label="On" value={String(state.weekday)} onChange={(value) => onChange({ weekday: Number(value) })}>
            {WEEKDAY_NAMES.map((name, index) => (
              <option key={name} value={index}>
                {name}
              </option>
            ))}
          </SelectField>
        )}

        {repeat === 'after_days' && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={everyDaysId} className={FIELD_LABEL}>
              About every how many days?
            </label>
            <input
              id={everyDaysId}
              type="text"
              inputMode="numeric"
              value={state.everyDaysText}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${everyDaysId}-error` : undefined}
              onChange={(event) => onChange({ everyDaysText: event.target.value })}
              className={cn(FIELD_INPUT, 'tabular-nums')}
            />
            <FieldError id={`${everyDaysId}-error`} message={error} />
          </div>
        )}
      </div>

      <div id={previewId} aria-live="polite" className="text-[13px] leading-snug text-wn-ink">
        {preview.length > 0 ? (
          <>
            <p className="font-semibold">{ruleSentence(ruleOf(state), state.startsOn)}</p>
            <p className="mt-0.5 text-wn-stone">
              Next: <span className="tabular-nums">{preview.map((day) => dayLabel(day, today)).join(' · ')}</span>
            </p>
          </>
        ) : (
          <p className="text-wn-stone">Pick how often to see the next dates.</p>
        )}
      </div>
    </fieldset>
  )
}
