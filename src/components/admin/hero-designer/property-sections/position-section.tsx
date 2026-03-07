'use client'

import { useState } from 'react'
import { Link2, Unlink } from 'lucide-react'
import type { ElementLayout, Spacing, Breakpoint } from '@/types/hero-designer'

interface PositionSectionProps {
  layout: ElementLayout
  breakpoint: Breakpoint
  onUpdate: (layout: Partial<ElementLayout>) => void
}

function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-zinc-400">{label}</span>
      <div className="flex items-center">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          min={min}
          max={max}
          step={step}
          className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-blue-500"
        />
        {suffix && <span className="ml-1 text-xs text-zinc-500">{suffix}</span>}
      </div>
    </label>
  )
}

function SpacingInputs({
  label,
  value,
  onChange,
}: {
  label: string
  value: Spacing
  onChange: (s: Spacing) => void
}) {
  const [linked, setLinked] = useState(
    value.top === value.right && value.right === value.bottom && value.bottom === value.left
  )

  function handleChange(side: keyof Spacing, v: number) {
    if (linked) {
      onChange({ top: v, right: v, bottom: v, left: v })
    } else {
      onChange({ ...value, [side]: v })
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-300">{label}</span>
        <button
          type="button"
          onClick={() => setLinked(!linked)}
          className="rounded p-0.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
          title={linked ? 'Unlink sides' : 'Link all sides'}
        >
          {linked ? <Link2 size={12} /> : <Unlink size={12} />}
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
          <NumberInput
            key={side}
            label={side[0].toUpperCase()}
            value={value[side]}
            onChange={(v) => handleChange(side, v)}
            min={0}
            step={1}
          />
        ))}
      </div>
    </div>
  )
}

export function PositionSection({ layout, onUpdate }: PositionSectionProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <NumberInput
          label="X"
          value={layout.x}
          onChange={(v) => onUpdate({ x: v })}
          suffix="%"
        />
        <NumberInput
          label="Y"
          value={layout.y}
          onChange={(v) => onUpdate({ y: v })}
          suffix="%"
        />
        <NumberInput
          label="Width"
          value={layout.width}
          onChange={(v) => onUpdate({ width: v })}
          suffix="%"
          min={-1}
        />
        <NumberInput
          label="Height"
          value={layout.height}
          onChange={(v) => onUpdate({ height: v })}
          suffix="%"
          min={-1}
        />
      </div>

      <NumberInput
        label="Rotation"
        value={layout.rotation}
        onChange={(v) => onUpdate({ rotation: v })}
        min={-360}
        max={360}
        suffix="deg"
      />

      <SpacingInputs
        label="Padding"
        value={layout.padding}
        onChange={(padding) => onUpdate({ padding })}
      />

      <SpacingInputs
        label="Margin"
        value={layout.margin}
        onChange={(margin) => onUpdate({ margin })}
      />
    </div>
  )
}
