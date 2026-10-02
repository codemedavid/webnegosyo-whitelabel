/**
 * Preset pills plus a from/to date form for the Store activity screen.
 *
 * Server-rendered: presets are links and the custom range is a plain GET form,
 * so the window lives in the URL (shareable, back-button safe) and the control
 * needs no client bundle.
 */

import Link from 'next/link'
import type { ActivityPreset, ActivityWindow } from '@/lib/activity/activity-window'

const PRESETS: { value: Exclude<ActivityPreset, 'custom'>; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
]

const DATE_INPUT =
  'rounded-lg border border-white/15 bg-black px-3 py-1.5 text-sm text-white [color-scheme:dark] focus:border-white/40 focus:outline-none'

interface ActivityRangePickerProps {
  basePath: string
  window: ActivityWindow
  /** The latest day a range may end on, `YYYY-MM-DD`. */
  maxDayKey: string
}

export function ActivityRangePicker({ basePath, window, maxDayKey }: ActivityRangePickerProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
        {PRESETS.map((preset) => {
          const isActive = window.preset === preset.value
          return (
            <Link
              key={preset.value}
              href={`${basePath}?range=${preset.value}`}
              scroll={false}
              aria-current={isActive ? 'true' : undefined}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                isActive ? 'bg-white text-black' : 'text-white/60 hover:text-white'
              }`}
            >
              {preset.label}
            </Link>
          )
        })}
      </div>

      <form method="get" action={basePath} className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-white/55">
          From
          <input
            type="date"
            name="from"
            defaultValue={window.fromDayKey}
            max={maxDayKey}
            required
            className={DATE_INPUT}
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-white/55">
          To
          <input
            type="date"
            name="to"
            defaultValue={window.toDayKey}
            max={maxDayKey}
            required
            className={DATE_INPUT}
          />
        </label>
        <button
          type="submit"
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            window.preset === 'custom'
              ? 'bg-white text-black hover:opacity-90'
              : 'border border-white/15 text-white/70 hover:border-white/25 hover:text-white'
          }`}
        >
          Apply
        </button>
      </form>
    </div>
  )
}
