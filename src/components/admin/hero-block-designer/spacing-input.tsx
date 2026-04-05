'use client'

import { useState } from 'react'
import { Link2, Unlink } from 'lucide-react'
import type { SpacingValue } from '@/types/hero-block-designer'

// ---------------------------------------------------------------------------
// SpacingInput — 4-value padding/margin input with link toggle
// ---------------------------------------------------------------------------

interface SpacingInputProps {
  label: string
  value: SpacingValue
  onChange: (value: SpacingValue) => void
}

export function SpacingInput({ label, value, onChange }: SpacingInputProps) {
  const allEqual =
    value.top === value.right &&
    value.right === value.bottom &&
    value.bottom === value.left
  const [linked, setLinked] = useState(allEqual)

  function handleChange(side: keyof SpacingValue, raw: string) {
    const n = Number(raw) || 0
    if (linked) {
      onChange({ top: n, right: n, bottom: n, left: n })
    } else {
      onChange({ ...value, [side]: n })
    }
  }

  const inputClass =
    'rounded border border-zinc-700 bg-zinc-800 px-1.5 py-1 text-center text-xs text-zinc-100 outline-none focus:border-blue-500'

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-300">{label}</span>
        <button
          type="button"
          onClick={() => setLinked((prev) => !prev)}
          className="rounded p-1 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
          title={linked ? 'Unlink sides' : 'Link sides'}
        >
          {linked ? <Link2 size={14} /> : <Unlink size={14} />}
        </button>
      </div>

      <div className="grid grid-cols-4 gap-1">
        {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
          <div key={side} className="flex flex-col items-center gap-0.5">
            <input
              type="number"
              value={value[side]}
              onChange={(e) => handleChange(side, e.target.value)}
              className={inputClass}
            />
            <span className="text-[10px] uppercase text-zinc-500">
              {side[0]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MarginInput — 2-value top/bottom input
// ---------------------------------------------------------------------------

interface MarginInputProps {
  label: string
  value: { top: number; bottom: number }
  onChange: (value: { top: number; bottom: number }) => void
}

export function MarginInput({ label, value, onChange }: MarginInputProps) {
  const inputClass =
    'rounded border border-zinc-700 bg-zinc-800 px-1.5 py-1 text-center text-xs text-zinc-100 outline-none focus:border-blue-500'

  return (
    <div className="space-y-1">
      <span className="text-xs font-medium text-zinc-300">{label}</span>

      <div className="grid grid-cols-2 gap-1">
        <div className="flex flex-col items-center gap-0.5">
          <input
            type="number"
            value={value.top}
            onChange={(e) =>
              onChange({ ...value, top: Number(e.target.value) || 0 })
            }
            className={inputClass}
          />
          <span className="text-[10px] uppercase text-zinc-500">T</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <input
            type="number"
            value={value.bottom}
            onChange={(e) =>
              onChange({ ...value, bottom: Number(e.target.value) || 0 })
            }
            className={inputClass}
          />
          <span className="text-[10px] uppercase text-zinc-500">B</span>
        </div>
      </div>
    </div>
  )
}
