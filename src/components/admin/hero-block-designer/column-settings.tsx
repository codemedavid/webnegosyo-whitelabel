'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { BlockColumn, Breakpoint, ColumnSettings } from '@/types/hero-block-designer'
import {
  HorizontalAlignButtons,
  VerticalAlignButtons,
} from '@/components/admin/hero-block-designer/alignment-buttons'
import { SpacingInput } from '@/components/admin/hero-block-designer/spacing-input'

// ---------------------------------------------------------------------------
// ColumnSettingsPanel — Right panel when a column is selected
// ---------------------------------------------------------------------------

interface ColumnSettingsPanelProps {
  column: BlockColumn
  breakpoint: Breakpoint
  onUpdateSettings: (settings: Partial<ColumnSettings>) => void
}

function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-zinc-800">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-400 hover:text-zinc-200"
      >
        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {title}
      </button>
      {isOpen && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}

const inputClass =
  'w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-blue-500'

export function ColumnSettingsPanel({
  column,
  breakpoint,
  onUpdateSettings,
}: ColumnSettingsPanelProps) {
  const settings = column.settings
  const bgMode = settings.background && settings.background !== 'transparent' ? 'color' : 'none'

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="border-b border-zinc-800 px-3 py-3">
        <h2 className="text-sm font-semibold text-zinc-100">Column</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Width: {column.width}% &middot; {breakpoint}
        </p>
      </div>

      {/* Alignment */}
      <CollapsibleSection title="Alignment">
        <div className="space-y-3">
          <div className="space-y-1">
            <span className="text-xs text-zinc-400">Vertical</span>
            <VerticalAlignButtons
              value={
                settings.verticalAlign === 'center'
                  ? 'middle'
                  : settings.verticalAlign === 'bottom'
                    ? 'bottom'
                    : 'top'
              }
              onChange={(v) =>
                onUpdateSettings({
                  verticalAlign:
                    v === 'middle' ? 'center' : v === 'bottom' ? 'bottom' : 'top',
                })
              }
            />
          </div>

          <div className="space-y-1">
            <span className="text-xs text-zinc-400">Horizontal</span>
            <HorizontalAlignButtons
              value={settings.horizontalAlign}
              onChange={(v) => onUpdateSettings({ horizontalAlign: v })}
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* Spacing */}
      <CollapsibleSection title="Spacing">
        <SpacingInput
          label="Padding"
          value={settings.padding}
          onChange={(padding) => onUpdateSettings({ padding })}
        />
      </CollapsibleSection>

      {/* Background */}
      <CollapsibleSection title="Background">
        <div className="space-y-3">
          <div className="flex gap-1">
            {(['none', 'color'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() =>
                  onUpdateSettings({
                    background: mode === 'none' ? 'transparent' : '#1a1a2e',
                  })
                }
                className={`flex-1 rounded px-3 py-1 text-xs capitalize ${
                  bgMode === mode
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {bgMode === 'color' && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-400">Color</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={settings.background || '#000000'}
                  onChange={(e) =>
                    onUpdateSettings({ background: e.target.value })
                  }
                  className="h-7 w-7 cursor-pointer rounded border border-zinc-700 bg-transparent"
                />
                <input
                  type="text"
                  value={settings.background || ''}
                  onChange={(e) =>
                    onUpdateSettings({ background: e.target.value })
                  }
                  className={`flex-1 ${inputClass}`}
                />
              </div>
            </label>
          )}
        </div>
      </CollapsibleSection>

      {/* Border Radius */}
      <CollapsibleSection title="Border Radius">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">Radius</span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={settings.borderRadius}
              onChange={(e) =>
                onUpdateSettings({
                  borderRadius: Number(e.target.value) || 0,
                })
              }
              min={0}
              className={inputClass}
            />
            <span className="shrink-0 text-xs text-zinc-500">px</span>
          </div>
        </label>
      </CollapsibleSection>
    </div>
  )
}
