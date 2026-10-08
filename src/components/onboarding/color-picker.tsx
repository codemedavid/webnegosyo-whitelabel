'use client'

import { Check, Pipette } from 'lucide-react'
import { STORE_TYPES, type StoreType } from '@/lib/onboarding/store-type'
import { FOCUS_RING, OB } from './onboarding-ui'
import { SUGGESTED_COLORS } from './onboarding-theme'

interface ColorPickerProps {
  /** The color in effect right now. */
  value: string
  /** Read from the logo at upload; offered first. */
  logoColor: string | null
  /** The store type's own color, offered when there is no logo color. */
  storeType: StoreType | ''
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

function suggestedLabel(logoColor: string | null, storeType: StoreType | ''): string {
  if (logoColor) return 'From your logo'
  return storeType && storeType !== 'other' ? `Suggested for a ${STORE_TYPES[storeType].label.toLowerCase()}` : 'Suggested for you'
}

/** The logo's color first, then a few brand-safe named colors, then any color. */
export function ColorPicker({ value, logoColor, storeType, onChange }: ColorPickerProps) {
  const featured = logoColor ?? (storeType ? STORE_TYPES[storeType].defaultColor : null)
  const others = SUGGESTED_COLORS.filter((color) => color.hex !== featured)
  const isFeaturedPicked = value === featured

  return (
    <div className="space-y-4">
      {featured && (
        <button
          type="button"
          onClick={() => onChange(featured)}
          aria-pressed={isFeaturedPicked}
          className={`flex w-full items-center gap-3 rounded-xl border bg-white p-3 text-left transition-[border-color,box-shadow] ${FOCUS_RING}`}
          style={{ borderColor: isFeaturedPicked ? featured : OB.lineStrong, boxShadow: isFeaturedPicked ? `0 0 0 1px ${featured}` : 'none' }}
        >
          <span className="h-10 w-10 shrink-0 rounded-lg" style={{ backgroundColor: featured }} aria-hidden />
          <span className="min-w-0 flex-1 text-[15px] font-semibold" style={{ color: OB.ink }}>{suggestedLabel(logoColor, storeType)}</span>
          {isFeaturedPicked && <Check className="h-5 w-5 shrink-0" style={{ color: featured }} aria-hidden />}
        </button>
      )}

      <div className="flex flex-wrap gap-3">
        {others.map((color) => (
          <Swatch key={color.hex} color={color.hex} label={color.name} isSelected={value === color.hex} onClick={() => onChange(color.hex)} />
        ))}
        <label
          className="relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-dashed border-[#D3CCC4] bg-white transition-transform hover:scale-105 focus-within:ring-2 focus-within:ring-[var(--ob-accent,#17130F)] focus-within:ring-offset-2"
          title="Any color"
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
