'use client'

import { COLUMN_PRESETS } from '@/lib/hero-block-defaults'

// ---------------------------------------------------------------------------
// ColumnLayoutPicker — Visual grid of column layout presets
// ---------------------------------------------------------------------------

interface ColumnLayoutPickerProps {
  currentWidths: number[]
  onChange: (widths: number[]) => void
}

function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  return a.every((v, i) => v === b[i])
}

export function ColumnLayoutPicker({ currentWidths, onChange }: ColumnLayoutPickerProps) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {COLUMN_PRESETS.map((preset) => {
        const isActive = arraysEqual(currentWidths, preset.widths)
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onChange(preset.widths)}
            title={preset.label}
            className={`flex h-10 items-end gap-px rounded border p-1 transition-colors ${
              isActive
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-zinc-700 bg-zinc-800 hover:border-zinc-500'
            }`}
          >
            {preset.widths.map((w, i) => (
              <div
                key={i}
                className={`h-full rounded-sm ${
                  isActive ? 'bg-blue-500' : 'bg-zinc-600'
                }`}
                style={{ width: `${w}%` }}
              />
            ))}
          </button>
        )
      })}
    </div>
  )
}
