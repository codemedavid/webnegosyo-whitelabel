'use client'

import { Check, Pipette } from 'lucide-react'
import { FOCUS_RING, OB } from './onboarding-ui'
import { SUGGESTED_COLORS } from './onboarding-theme'

interface ColorPickerProps {
  /** The color in effect right now. */
  value: string
  /** Read from the logo at upload; offered first. */
  logoColor: string | null
  /** The store type's own color, offered when there is no logo color. */
  typeColor: string | null
  onChange: (color: string) => void
}

function Swatch({ color, isSelected, label, onClick }: { color: string; isSelected: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      aria-label={label}
      title={label}
      className={`relative h-11 w-11 rounded-full transition-transform duration-150 hover:scale-105 active:scale-95 ${FOCUS_RING}`}
      style={{
        backgroundColor: color,
        boxShadow: isSelected ? `0 0 0 3px #fff, 0 0 0 5px ${color}` : 'inset 0 0 0 1px rgba(0,0,0,0.08)',
      }}
    >
      {isSelected && <Check className="absolute inset-0 m-auto h-5 w-5 text-white drop-shadow" aria-hidden />}
    </button>
  )
}

/** The logo's color first, then a few brand-safe suggestions, then any color. */
export function ColorPicker({ value, logoColor, typeColor, onChange }: ColorPickerProps) {
  const featured = logoColor ?? typeColor
  const others = SUGGESTED_COLORS.filter((color) => color !== featured)

  return (
    <div className="space-y-4">
      {featured && (
        <button
          type="button"
          onClick={() => onChange(featured)}
          aria-pressed={value === featured}
          className={`flex w-full items-center gap-3 rounded-xl border bg-white p-3 text-left transition-[border-color,box-shadow] ${FOCUS_RING}`}
          style={{ borderColor: value === featured ? featured : OB.lineStrong, boxShadow: value === featured ? `0 0 0 1px ${featured}` : 'none' }}
        >
          <span className="h-10 w-10 shrink-0 rounded-lg" style={{ backgroundColor: featured }} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold" style={{ color: OB.ink }}>
              {logoColor ? 'From your logo' : 'Made for your store type'}
            </span>
            <span className="block text-[13px] uppercase tabular-nums" style={{ color: OB.muted }}>{featured}</span>
          </span>
          {value === featured && <Check className="h-5 w-5 shrink-0" style={{ color: featured }} aria-hidden />}
        </button>
      )}

      <div className="flex flex-wrap gap-3">
        {others.map((color) => (
          <Swatch key={color} color={color} label={`Use ${color}`} isSelected={value === color} onClick={() => onChange(color)} />
        ))}
        <label
          className="relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-dashed border-[#D3CCC4] bg-white transition-transform hover:scale-105 focus-within:ring-2 focus-within:ring-[var(--ob-accent,#17130F)] focus-within:ring-offset-2"
          title="Pick any color"
        >
          <Pipette className="h-4 w-4" style={{ color: OB.muted }} aria-hidden />
          <span className="sr-only">Pick any color</span>
          <input
            type="color"
            value={value}
            onChange={(event) => onChange(event.target.value.toLowerCase())}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>
    </div>
  )
}
