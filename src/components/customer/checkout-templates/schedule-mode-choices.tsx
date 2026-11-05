'use client'

/**
 * "Now or later" in the extra designs a Page Designer schedule block can
 * pick (the cards are AdvanceOrderScheduler's own). Same choices, same
 * `setScheduleMode`; colours from the checkout theme (`--co-*`) only.
 */

import { CalendarClock, Zap } from 'lucide-react'

import type { ScheduleMode } from '@/hooks/checkout/use-checkout-schedule'
import { cornersClass, type CornersChoice } from '@/lib/page-designer/knobs'

interface ModeItem {
  mode: ScheduleMode
  title: string
  subtitle: string
}

interface ScheduleModeChoicesProps {
  design: 'pill' | 'list'
  corners: CornersChoice
  items: readonly ModeItem[]
  value: ScheduleMode
  onSelect: (mode: ScheduleMode) => void
}

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--co-accent)] focus-visible:ring-offset-1'

function ModeIcon({ mode, className }: { mode: ScheduleMode; className: string }) {
  const Icon = mode === 'asap' ? Zap : CalendarClock
  return <Icon aria-hidden="true" className={className} />
}

function PillModes({ corners, items, value, onSelect }: Omit<ScheduleModeChoicesProps, 'design'>) {
  const track = cornersClass(corners, 'rounded-full')
  const chosen = items.find((item) => item.mode === value)
  return (
    <div>
      <div role="radiogroup" aria-label="When" className={`flex gap-1 bg-[var(--co-subtle-strong)] p-1 ${track}`}>
        {items.map((item) => {
          const isActive = item.mode === value
          return (
            <button
              key={item.mode}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => onSelect(item.mode)}
              className={`flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 px-2 py-2 text-sm font-semibold transition ${track} ${FOCUS} ${
                isActive ? 'bg-[var(--co-accent)] text-[color:var(--co-accent-text)] shadow-sm' : 'text-[color:var(--co-text)] hover:bg-[var(--co-subtle)]'
              }`}
            >
              <ModeIcon mode={item.mode} className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.title}</span>
            </button>
          )
        })}
      </div>
      {chosen?.subtitle && <p className="mt-2 px-1 text-sm text-[color:var(--co-muted)]">{chosen.subtitle}</p>}
    </div>
  )
}

function ListModes({ corners, items, value, onSelect }: Omit<ScheduleModeChoicesProps, 'design'>) {
  return (
    <div role="radiogroup" aria-label="When" className="flex flex-col gap-2">
      {items.map((item) => {
        const isActive = item.mode === value
        return (
          <button
            key={item.mode}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onSelect(item.mode)}
            className={`flex min-h-14 w-full items-center gap-3 border-2 px-4 py-3 text-left transition ${cornersClass(corners, 'rounded-xl')} ${FOCUS} ${
              isActive
                ? 'border-[color:var(--co-accent)] bg-[var(--co-accent-soft)]'
                : 'border-[color:var(--co-border)] bg-[var(--co-card)] hover:border-[color:var(--co-accent-border)]'
            }`}
          >
            <ModeIcon mode={item.mode} className={`h-5 w-5 shrink-0 ${isActive ? 'text-[color:var(--co-accent)]' : 'text-[color:var(--co-muted)]'}`} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-[color:var(--co-text)]">{item.title}</span>
              {item.subtitle && <span className="mt-0.5 block text-xs text-[color:var(--co-muted)]">{item.subtitle}</span>}
            </span>
            <span
              aria-hidden="true"
              className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                isActive ? 'border-[color:var(--co-accent)]' : 'border-[color:var(--co-border)]'
              }`}
            >
              {isActive && <span className="h-2.5 w-2.5 rounded-full bg-[var(--co-accent)]" />}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** The now/later choice as a pill toggle or as rows. */
export function ScheduleModeChoices({ design, ...props }: ScheduleModeChoicesProps) {
  return design === 'pill' ? <PillModes {...props} /> : <ListModes {...props} />
}
