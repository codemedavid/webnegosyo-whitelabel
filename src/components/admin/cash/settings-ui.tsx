import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** A Settings card: white panel, ring-1 border, heading + one-line purpose. */
export function SettingsCard({ id, title, description, children }: { id?: string; title: string; description: ReactNode; children: ReactNode }) {
  const titleId = useId()
  return (
    <section id={id} aria-labelledby={titleId} className="scroll-mt-24 rounded-2xl bg-white ring-1 ring-border">
      <header className="px-5 pb-3 pt-5">
        <h2 id={titleId} className="text-[16px] font-extrabold tracking-[-0.01em] text-wn-ink">
          {title}
        </h2>
        <p className="mt-0.5 text-[13.5px] leading-snug text-wn-stone text-pretty">{description}</p>
      </header>
      <div className="flex flex-col gap-5 px-5 pb-5">{children}</div>
    </section>
  )
}

export interface SegmentOption<T extends string> {
  value: T
  label: string
}

/** Two or three pill choices, as a radio group. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  isDisabled = false,
}: {
  label: string
  value: T
  options: ReadonlyArray<SegmentOption<T>>
  onChange: (value: T) => void
  isDisabled?: boolean
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-full bg-wn-sand p-1 ring-1 ring-wn-line">
      {options.map((option) => {
        const isOn = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isOn}
            disabled={isDisabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'min-h-9 rounded-full px-3.5 text-[13.5px] font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-wn-ink disabled:opacity-60',
              isOn ? 'bg-wn-ink text-white' : 'text-wn-ink hover:bg-white',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** One rule: words on the left, the control on the right (stacked on a phone). */
export function RuleRow({ title, hint, control }: { title: string; hint?: ReactNode; control: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-wn-line pt-4 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="text-[14.5px] font-bold text-wn-ink">{title}</p>
        {hint && <p className="mt-0.5 text-[13px] leading-snug text-wn-stone text-pretty">{hint}</p>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  )
}

export const PRIMARY_BUTTON =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-wn-ink px-5 text-[14px] font-bold text-white outline-none hover:bg-wn-ink-raised focus-visible:ring-2 focus-visible:ring-wn-ink focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
export const SECONDARY_BUTTON =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-white px-5 text-[14px] font-bold text-wn-ink ring-1 ring-border outline-none hover:ring-wn-ink focus-visible:ring-2 focus-visible:ring-wn-ink disabled:cursor-not-allowed disabled:opacity-50'
export const FIELD_CLASS =
  'min-h-11 rounded-xl bg-white px-3 text-[14px] text-wn-ink ring-1 ring-border outline-none focus-visible:ring-2 focus-visible:ring-wn-ink disabled:opacity-60'
