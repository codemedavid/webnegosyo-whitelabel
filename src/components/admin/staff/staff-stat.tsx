import type { ReactNode } from 'react'

/**
 * The figures above a staff page.
 *
 * Same shape as the branches summary strip on purpose — an owner moving
 * between Branches and Staff should not have to learn a second way to read a
 * number. Five tiles at most; anything that needs interrogating belongs on
 * the profile below, not in the strip.
 */

export interface StaffStatProps {
  testId: string
  label: string
  value: string
  icon: ReactNode
  hint?: string
  /** Colours the value when the figure itself is the warning. */
  tone?: 'default' | 'positive' | 'warning'
}

const TONES: Record<NonNullable<StaffStatProps['tone']>, string> = {
  default: '',
  positive: 'text-emerald-600',
  warning: 'text-amber-600',
}

export function StaffStat({ testId, label, value, icon, hint, tone = 'default' }: StaffStatProps) {
  return (
    <div data-testid={testId} className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`truncate text-lg font-semibold tabular-nums ${TONES[tone]}`}>{value}</p>
        {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  )
}

export function StaffStatStrip({ children }: { children: ReactNode }) {
  return (
    <div className="grid divide-y rounded-xl border bg-card sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-5">
      {children}
    </div>
  )
}
