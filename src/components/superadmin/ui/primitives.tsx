import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDelta } from './format'

/* =============================================================================
   Superadmin shared UI primitives — the building blocks every surface reuses
   so the pure-black `/download` aesthetic stays perfectly consistent.

   These are server-compatible (no hooks). Stateful wrappers (range tabs etc.)
   are controlled — the parent owns the state.
   ========================================================================== */

/** Uppercase tracking-widest eyebrow pill. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-white/15 px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-white/60',
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Page header: eyebrow + title + subtitle, with an optional actions slot. */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h1 className={cn('text-3xl font-bold tracking-tight text-white', eyebrow && 'mt-4')}>{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-white/55">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/** The signature `/download` card surface. */
export function Panel({
  children,
  className,
  hover,
  padding = 'p-6',
}: {
  children: ReactNode
  className?: string
  hover?: boolean
  padding?: string
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-white/10 bg-white/[0.02]',
        hover && 'transition-colors hover:border-white/20 hover:bg-white/[0.04]',
        padding,
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Title + optional subtitle + optional action, used as a panel/section header. */
export function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  action,
  className,
}: {
  icon?: LucideIcon
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div className="flex items-center gap-3">
        {Icon ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2">
            <Icon className="h-5 w-5 text-white" />
          </div>
        ) : null}
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-white">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-sm text-white/55">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

/** Trend delta pill: green up / red down / neutral. null pct → "New". */
export function DeltaPill({ pct, className }: { pct: number | null; className?: string }) {
  const positive = pct != null && pct > 0
  const negative = pct != null && pct < 0
  const Icon = positive ? ArrowUpRight : negative ? ArrowDownRight : Minus
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-xs font-medium',
        positive && 'border-emerald-400/20 bg-emerald-400/10 text-emerald-400',
        negative && 'border-red-400/20 bg-red-400/10 text-red-400',
        !positive && !negative && 'border-white/10 bg-white/[0.06] text-white/55',
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {formatDelta(pct)}
    </span>
  )
}

/** Headline KPI tile. */
export function KpiCard({
  label,
  value,
  icon: Icon,
  delta,
  hint,
  className,
}: {
  label: ReactNode
  value: ReactNode
  icon?: LucideIcon
  delta?: number | null
  hint?: ReactNode
  className?: string
}) {
  return (
    <Panel hover padding="p-5" className={className}>
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-white/45">{label}</span>
        {Icon ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
            <Icon className="h-4 w-4 text-white" />
          </div>
        ) : null}
      </div>
      <div className="mt-4 flex items-end gap-2">
        <div className="text-3xl font-bold tracking-tight text-white">{value}</div>
        {delta !== undefined ? <DeltaPill pct={delta ?? null} className="mb-1" /> : null}
      </div>
      {hint ? <p className="mt-1 text-xs text-white/55">{hint}</p> : null}
    </Panel>
  )
}

export interface RangeTabOption<T extends string> {
  value: T
  label: string
}

/** Controlled segmented range/toggle control. */
export function RangeTabs<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T
  onChange: (value: T) => void
  options: RangeTabOption<T>[]
  className?: string
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1',
        className,
      )}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
            value === opt.value ? 'bg-white text-black' : 'text-white/60 hover:text-white',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

/** Active / inactive status pill with a leading dot. */
export function StatusBadge({ active, className }: { active: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        active
          ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-400'
          : 'border-white/10 bg-white/[0.06] text-white/45',
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-emerald-400' : 'bg-white/40')} />
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

/** Empty-state block for panels with no data. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {Icon ? <Icon className="mb-4 h-10 w-10 text-white/20" /> : null}
      <p className="text-sm font-medium text-white/60">{title}</p>
      {description ? <p className="mt-1 text-xs text-white/45">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}
