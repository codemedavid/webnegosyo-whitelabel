'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { GlobalStyles } from '@/types/hero-block-designer'

// ---------------------------------------------------------------------------
// GlobalSettings — Right panel when nothing is selected
// ---------------------------------------------------------------------------

interface GlobalSettingsProps {
  globalStyles: GlobalStyles
  onUpdate: (styles: Partial<GlobalStyles>) => void
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

export function GlobalSettings({ globalStyles, onUpdate }: GlobalSettingsProps) {
  const hasImage = !!globalStyles.backgroundImage

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="border-b border-zinc-800 px-3 py-3">
        <h2 className="text-sm font-semibold text-zinc-100">Hero Settings</h2>
        <p className="mt-0.5 text-xs text-zinc-500">No element selected</p>
      </div>

      {/* Background */}
      <CollapsibleSection title="Background">
        <div className="space-y-3">
          {/* Background Color */}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Background Color</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={globalStyles.backgroundColor}
                onChange={(e) => onUpdate({ backgroundColor: e.target.value })}
                className="h-7 w-7 cursor-pointer rounded border border-zinc-700 bg-transparent"
              />
              <input
                type="text"
                value={globalStyles.backgroundColor}
                onChange={(e) => onUpdate({ backgroundColor: e.target.value })}
                className={`flex-1 ${inputClass}`}
              />
            </div>
          </label>

          {/* Background Image URL */}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Background Image URL</span>
            <input
              type="text"
              value={globalStyles.backgroundImage ?? ''}
              onChange={(e) =>
                onUpdate({
                  backgroundImage: e.target.value || undefined,
                })
              }
              placeholder="https://..."
              className={inputClass}
            />
          </label>

          {/* Image-dependent controls */}
          {hasImage && (
            <>
              <label className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400">Image Opacity</span>
                  <span className="text-xs text-zinc-500">
                    {/* Display current value — opacity lives outside GlobalStyles,
                        so we just show 1.00 as default placeholder */}
                    1.00
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  defaultValue={1}
                  className="w-full accent-blue-500"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-400">Object Fit</span>
                <select defaultValue="cover" className={inputClass}>
                  <option value="cover">Cover</option>
                  <option value="contain">Contain</option>
                  <option value="fill">Fill</option>
                </select>
              </label>
            </>
          )}
        </div>
      </CollapsibleSection>

      {/* Layout */}
      <CollapsibleSection title="Layout">
        <div className="space-y-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Max Width</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={globalStyles.maxWidth}
                onChange={(e) => {
                  const v = Number(e.target.value) || 320
                  onUpdate({ maxWidth: Math.min(2560, Math.max(320, v)) })
                }}
                min={320}
                max={2560}
                className={inputClass}
              />
              <span className="shrink-0 text-xs text-zinc-500">px</span>
            </div>
          </label>
        </div>
      </CollapsibleSection>
    </div>
  )
}
