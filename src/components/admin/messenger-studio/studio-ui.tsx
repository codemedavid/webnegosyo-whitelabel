'use client'

/**
 * Small controls in the Branding Studio's house style (field-row.tsx):
 * emerald switches, pill choice chips, uppercase section labels, 10px
 * bordered rows. Tokens: ink #1D1815, line #E5E0D6, muted #6B655B / #8B857B.
 */

import type { ReactNode } from 'react'

export function StudioSwitch({ isOn, onChange, label, disabled }: { isOn: boolean; onChange: (isOn: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      aria-label={label}
      disabled={disabled}
      onClick={(event) => { event.stopPropagation(); onChange(!isOn) }}
      className={`relative h-[22px] w-[37px] flex-shrink-0 rounded-full transition-colors disabled:opacity-40 ${isOn ? 'bg-emerald-700' : 'bg-neutral-300'}`}
    >
      <span className="absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all" style={{ left: isOn ? 18 : 3 }} />
    </button>
  )
}

export function SectionLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-[11px] font-extrabold uppercase tracking-widest text-[#8B857B] ${className}`}>{children}</p>
}

export function ChoiceChips<T extends string | number>({ options, value, onChange, label }: {
  options: ReadonlyArray<{ value: T; label: string; disabled?: boolean }>
  value: T
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const isActive = option.value === value
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={isActive}
            disabled={option.disabled && !isActive}
            onClick={() => onChange(option.value)}
            className={`min-h-8 rounded-full border px-3 py-1.5 text-[11.5px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              isActive ? 'border-[#1D1815] bg-[#1D1815] text-white' : 'border-[#E5E0D6] bg-white text-[#6B655B] hover:border-[#B5AEA2]'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** The panel's title block, as the Branding Studio's settings panel. */
export function PanelHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="border-b border-[#E5E0D6] px-[18px] pb-3 pt-4 max-md:pt-1">
      <div className="flex items-center gap-2.5">
        <h2 className="text-[16px] font-extrabold">{title}</h2>
        <div className="flex-1" />
        {action}
      </div>
      <p className="mt-1 text-[12px] leading-snug text-[#8B857B]">{description}</p>
    </div>
  )
}

export function Notice({ tone = 'amber', children }: { tone?: 'amber' | 'red'; children: ReactNode }) {
  return (
    <p role={tone === 'red' ? 'alert' : undefined} className={`rounded-[10px] px-3 py-2 text-[12px] font-semibold leading-snug ${tone === 'red' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'}`}>
      {children}
    </p>
  )
}
