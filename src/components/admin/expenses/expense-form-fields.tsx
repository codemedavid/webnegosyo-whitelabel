'use client'

import { useId, type ReactNode, type Ref } from 'react'
import { Lock } from 'lucide-react'
import { parsePesoInput } from '@/lib/expenses/keypad'
import { payableDrawerLabel } from '@/lib/expenses/read/payable-drawers'
import type { PayableDrawer } from '@/lib/expenses/types'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PaidFromIcon } from './expense-badges'
import { PAID_FROM_LABELS, WEB_PAID_FROM, formatPeso, pesoWords } from './expense-format'
import type { WebPaidFrom } from './expense-form-model'

export const FIELD_LABEL = 'text-[13px] font-semibold text-wn-ink'
export const FIELD_INPUT =
  'h-11 w-full rounded-xl border border-wn-line bg-white px-3 text-[15px] text-wn-ink outline-none transition-shadow placeholder:text-wn-stone/80 focus-visible:border-wn-ink focus-visible:ring-[3px] focus-visible:ring-wn-ink/15 disabled:cursor-not-allowed disabled:bg-wn-sand disabled:text-wn-stone aria-[invalid=true]:border-red-700'

export function FieldError({ id, message }: { id: string; message?: string | null }) {
  if (!message) return null
  return (
    <p id={id} role="alert" className="text-[12.5px] font-semibold text-red-800">
      {message}
    </p>
  )
}

interface AmountFieldProps {
  inputId: string
  inputRef?: Ref<HTMLInputElement>
  value: string
  onChange: (text: string) => void
  error?: string | null
  isLocked?: boolean
}

/**
 * Amount first, big, in tabular figures. Typed as text so "1,250", "₱80.50"
 * and "1250" all work; the line under it says how it was read.
 */
export function AmountField({ inputId, inputRef, value, onChange, error, isLocked = false }: AmountFieldProps) {
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`
  const cents = value.trim() === '' ? null : parsePesoInput(value)
  const reading = cents !== null && cents > 0 ? `${formatPeso(cents, { exact: true })} · ${pesoWords(cents)}` : 'Whole pesos, or add centavos: 80.50'
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className={FIELD_LABEL}>
        Amount
        <span className="sr-only"> (required)</span>
      </label>
      <div
        className={cn(
          'flex h-16 items-center gap-1 rounded-2xl border border-wn-line bg-white px-4 transition-shadow focus-within:border-wn-ink focus-within:ring-[3px] focus-within:ring-wn-ink/15',
          error && 'border-red-700 focus-within:border-red-700 focus-within:ring-red-700/15',
          isLocked && 'bg-wn-sand',
        )}
      >
        <span aria-hidden className="text-[26px] font-semibold text-wn-stone">
          ₱
        </span>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={value}
          disabled={isLocked}
          placeholder="0"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hintId}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => {
            // Tidy what was typed into the way money reads: "1250" → "1,250".
            if (cents !== null && cents > 0) onChange(formatPeso(cents).replace('₱', ''))
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-[34px] font-bold tabular-nums tracking-[-0.01em] text-wn-ink outline-none placeholder:text-wn-line disabled:cursor-not-allowed"
        />
        {isLocked && <Lock className="size-4 shrink-0 text-wn-stone" aria-label="Locked" />}
      </div>
      {error ? (
        <FieldError id={errorId} message={error} />
      ) : (
        <p id={hintId} className="text-[12.5px] tabular-nums text-wn-stone">
          {reading}
        </p>
      )}
    </div>
  )
}

interface PaidFromFieldProps {
  value: WebPaidFrom
  onChange: (value: WebPaidFrom) => void
  /** Open drawers this person may take from; empty = no "Cashier drawer" pill. */
  drawers?: readonly PayableDrawer[]
  /** The drawer picked; null = paid from `value`. */
  drawerShiftId?: string | null
  onPickDrawer?: (drawer: PayableDrawer) => void
}

const PILL =
  'relative inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-semibold ring-1 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-wn-ink has-[:focus-visible]:ring-offset-2'
const PILL_ON = 'bg-wn-ink text-white ring-wn-ink'
const PILL_OFF = 'bg-white text-wn-ink ring-wn-line hover:ring-wn-ink/50'

/**
 * Where the money came from, as pills (a radio group: arrow keys move).
 * "Cashier drawer" leads when there is an open drawer this person may take
 * from; picking it takes the cash out of that drawer ("Take from a cashier's
 * drawer"). With several open drawers, a second row asks which.
 */
export function PaidFromField({ value, onChange, drawers = [], drawerShiftId = null, onPickDrawer }: PaidFromFieldProps) {
  const name = useId()
  const drawerName = useId()
  const isDrawerOn = drawerShiftId !== null
  const canPickDrawer = drawers.length > 0 && onPickDrawer !== undefined
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className={cn(FIELD_LABEL, 'mb-1.5')}>Paid from</legend>
      <div className="flex flex-wrap gap-1.5">
        {canPickDrawer && (
          <label className={cn(PILL, isDrawerOn ? PILL_ON : PILL_OFF)}>
            <input
              type="radio"
              name={name}
              value="drawer"
              checked={isDrawerOn}
              onChange={() => onPickDrawer(drawers.find((drawer) => drawer.shiftId === drawerShiftId) ?? drawers[0])}
              className="sr-only"
            />
            <PaidFromIcon paidFrom="drawer" className={cn('size-3.5', isDrawerOn ? 'text-white' : 'text-wn-stone')} />
            {CASHIER_DRAWER_LABEL}
          </label>
        )}
        {WEB_PAID_FROM.map((option) => {
          const isChecked = !isDrawerOn && option === value
          return (
            <label key={option} className={cn(PILL, isChecked ? PILL_ON : PILL_OFF)}>
              <input
                type="radio"
                name={name}
                value={option}
                checked={isChecked}
                onChange={() => onChange(option)}
                className="sr-only"
              />
              <PaidFromIcon paidFrom={option} className={cn('size-3.5', isChecked ? 'text-white' : 'text-wn-stone')} />
              {PAID_FROM_LABELS[option]}
            </label>
          )
        })}
      </div>
      {canPickDrawer && isDrawerOn && (
        <div className="mt-1 flex flex-col gap-1.5 rounded-xl bg-wn-sand px-3.5 py-3 ring-1 ring-wn-line">
          {drawers.length > 1 ? (
            <div role="radiogroup" aria-label="Which drawer" className="flex flex-wrap gap-1.5">
              {drawers.map((drawer) => {
                const isChecked = drawer.shiftId === drawerShiftId
                return (
                  <label key={drawer.shiftId} className={cn(PILL, isChecked ? PILL_ON : PILL_OFF)}>
                    <input
                      type="radio"
                      name={drawerName}
                      value={drawer.shiftId}
                      checked={isChecked}
                      onChange={() => onPickDrawer(drawer)}
                      className="sr-only"
                    />
                    {payableDrawerLabel(drawer)}
                  </label>
                )
              })}
            </div>
          ) : (
            <p className="text-[13.5px] font-semibold text-wn-ink">{payableDrawerLabel(drawers[0])}</p>
          )}
          <p className="text-[12.5px] text-wn-stone">
            The cash comes out of this drawer today, so the cashier’s count expects it. Check the drawer has it.
          </p>
        </div>
      )}
    </fieldset>
  )
}

export const CASHIER_DRAWER_LABEL = 'Cashier drawer'

interface DateFieldProps {
  inputId: string
  value: string
  onChange: (value: string) => void
  min: string
  max: string
  error?: string | null
  isLocked?: boolean
}

export function DateField({ inputId, value, onChange, min, max, error, isLocked = false }: DateFieldProps) {
  const errorId = `${inputId}-error`
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className={FIELD_LABEL}>
        Date paid
      </label>
      <input
        id={inputId}
        type="date"
        value={value}
        min={min}
        max={max}
        disabled={isLocked}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={cn(FIELD_INPUT, 'tabular-nums')}
      />
      <FieldError id={errorId} message={error} />
    </div>
  )
}

export const WHOLE_STORE_VALUE = '__whole_store__'

interface BranchFieldProps {
  outlets: readonly { id: string; name: string }[]
  value: string | null
  onChange: (outletId: string | null) => void
  lockedLabel?: string | null
  isLocked?: boolean
}

/** Which branch it was for. "Whole store" = rent, permits and the like (outlet NULL). */
export function BranchField({ outlets, value, onChange, lockedLabel, isLocked = false }: BranchFieldProps) {
  const labelId = useId()
  const current = value === null ? 'Whole store' : (outlets.find((outlet) => outlet.id === value)?.name ?? 'Branch')
  if (lockedLabel || isLocked) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className={FIELD_LABEL}>Branch</span>
        <span className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-wn-sand px-3 text-[14px] font-semibold text-wn-ink ring-1 ring-wn-line">
          <Lock className="size-3.5 text-wn-stone" aria-hidden />
          {lockedLabel ?? current}
          <span className="sr-only"> (locked)</span>
        </span>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className={FIELD_LABEL}>
        Branch
      </span>
      <Select value={value ?? WHOLE_STORE_VALUE} onValueChange={(next) => onChange(next === WHOLE_STORE_VALUE ? null : next)}>
        <SelectTrigger aria-labelledby={labelId} className="min-h-11 w-full rounded-xl border-wn-line data-[size=default]:h-11">
          <SelectValue>{current}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={WHOLE_STORE_VALUE}>Whole store</SelectItem>
          {outlets.map((outlet) => (
            <SelectItem key={outlet.id} value={outlet.id}>
              {outlet.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

interface NoteFieldProps {
  inputId: string
  value: string
  onChange: (value: string) => void
  isRequired: boolean
  requiredFor?: string
  error?: string | null
}

export function NoteField({ inputId, value, onChange, isRequired, requiredFor, error }: NoteFieldProps) {
  const errorId = `${inputId}-error`
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className={FIELD_LABEL}>
        Note{' '}
        <span className="font-normal text-wn-stone">{isRequired ? `(needed for ${requiredFor ?? 'this category'})` : '(optional)'}</span>
      </label>
      <input
        id={inputId}
        type="text"
        value={value}
        maxLength={200}
        required={isRequired}
        placeholder="e.g. Petron LPG 11kg"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={FIELD_INPUT}
      />
      <FieldError id={errorId} message={error} />
    </div>
  )
}

interface YesNoProps {
  legend: ReactNode
  hint?: ReactNode
  value: boolean | null
  onChange: (value: boolean) => void
}

/** One inline Yes / No row (plan §2.2: "Did this go into your stock count?"). */
export function YesNoField({ legend, hint, value, onChange }: YesNoProps) {
  const name = useId()
  return (
    <fieldset className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-wn-sand px-3.5 py-3 ring-1 ring-wn-line">
      <div className="min-w-0">
        <legend className="text-[14px] font-semibold text-wn-ink">{legend}</legend>
        {hint && <p className="mt-0.5 text-[12.5px] text-wn-stone">{hint}</p>}
      </div>
      <div className="flex gap-1.5">
        {([true, false] as const).map((option) => {
          const isChecked = value === option
          return (
            <label
              key={String(option)}
              className={cn(
                'inline-flex min-h-10 min-w-16 cursor-pointer items-center justify-center rounded-full px-4 text-[13.5px] font-bold ring-1 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-wn-ink has-[:focus-visible]:ring-offset-2',
                isChecked ? 'bg-wn-ink text-white ring-wn-ink' : 'bg-white text-wn-ink ring-wn-line hover:ring-wn-ink/50',
              )}
            >
              <input type="radio" name={name} checked={isChecked} onChange={() => onChange(option)} className="sr-only" />
              {option ? 'Yes' : 'No'}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
