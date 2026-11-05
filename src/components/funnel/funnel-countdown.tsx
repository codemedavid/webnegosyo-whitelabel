'use client'

import { useEffect, useState } from 'react'
import { COUNTDOWN } from './funnel-copy'
import { SIX_MONTH_DEAL_ENDS_MS, countdownParts, type CountdownParts } from './funnel-offer'

const TICK_MS = 1000

type CountdownState = { status: 'pending' } | { status: 'running'; parts: CountdownParts } | { status: 'ended' }

/**
 * Time left on the six-month deal. The server can't know the visitor's clock,
 * so the first render is `pending` (placeholder digits, same footprint) and
 * the real numbers arrive after mount, without a hydration mismatch.
 */
function useDealCountdown(endsAtMs: number = SIX_MONTH_DEAL_ENDS_MS): CountdownState {
  const [state, setState] = useState<CountdownState>({ status: 'pending' })

  useEffect(() => {
    const read = (): CountdownState => {
      const parts = countdownParts(endsAtMs, Date.now())
      return parts ? { status: 'running', parts } : { status: 'ended' }
    }
    const first = read()
    setState(first)
    if (first.status === 'ended') return
    const timer = setInterval(() => {
      const next = read()
      setState(next)
      if (next.status === 'ended') clearInterval(timer)
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [endsAtMs])

  return state
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

const UNIT_KEYS = ['days', 'hours', 'minutes', 'seconds'] as const

/** The reference's red italic digits with tiny unit labels underneath. */
export function CountdownDigits({ showLabel = true }: { showLabel?: boolean }) {
  const state = useDealCountdown()
  if (state.status === 'ended') return null
  const parts = state.status === 'running' ? state.parts : null

  return (
    <div className="flex items-center gap-3" role="timer" aria-label={COUNTDOWN.label}>
      {showLabel && (
        <span className="hidden lg:block">
          <span className="fn-kicker fn-kicker--red !font-bold !tracking-[0.13em]">
            <span aria-hidden className="fn-dot" />
            {COUNTDOWN.shortLabel}
          </span>
        </span>
      )}
      <div className="flex items-start gap-[6px] sm:gap-[10px]">
        {UNIT_KEYS.map((key) => (
          <div key={key} className="flex min-w-[24px] flex-col items-center sm:min-w-[28px]">
            <span className={`fn-cd-num ${key === 'seconds' ? 'fn-cd-num--secs' : ''}`}>
              {parts ? (key === 'days' ? parts.days : pad(parts[key])) : '--'}
            </span>
            <span className="fn-cd-unit">{COUNTDOWN.units[key]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** One-line "6d 23h 12m 05s" for the plan card and the closing band. */
export function CountdownChip() {
  const state = useDealCountdown()
  if (state.status === 'ended') return null
  const parts = state.status === 'running' ? state.parts : null
  const units = COUNTDOWN.compactUnits
  const value = parts
    ? `${parts.days}${units.days} ${pad(parts.hours)}${units.hours} ${pad(parts.minutes)}${units.minutes} ${pad(parts.seconds)}${units.seconds}`
    : '--'

  return (
    <p role="timer" className="fn-tag fn-tag--red flex-wrap justify-center">
      <span aria-hidden className="fn-dot" />
      {COUNTDOWN.label}
      <span className="fn-tabular tracking-normal text-white">{value}</span>
    </p>
  )
}
