'use client'

import { Plus } from 'lucide-react'

// ---------------------------------------------------------------------------
// InsertionPoint — "+" button shown between sections/widgets
// ---------------------------------------------------------------------------

interface InsertionPointProps {
  onClick: () => void
  label?: string
}

export function InsertionPoint({ onClick, label }: InsertionPointProps) {
  return (
    <div className="group relative flex items-center justify-center py-2">
      {/* Horizontal line */}
      <div className="absolute inset-x-4 h-px bg-transparent transition-colors group-hover:bg-blue-400" />

      {/* Plus button */}
      <button
        type="button"
        onClick={onClick}
        title={label ?? 'Insert here'}
        className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full border border-zinc-600 bg-zinc-800 text-zinc-400 opacity-0 transition-all group-hover:opacity-100 hover:border-blue-400 hover:bg-blue-500 hover:text-white"
      >
        <Plus size={14} />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// EmptyColumnDropZone — Placeholder for empty columns
// ---------------------------------------------------------------------------

interface EmptyColumnDropZoneProps {
  onClick: () => void
}

export function EmptyColumnDropZone({ onClick }: EmptyColumnDropZoneProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-24 w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-zinc-600 text-zinc-500 transition-colors hover:border-blue-400 hover:text-blue-400"
    >
      <Plus size={20} />
      <span className="text-xs">Add Widget</span>
    </button>
  )
}
