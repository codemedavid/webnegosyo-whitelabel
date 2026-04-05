'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type {
  BlockSection,
  Breakpoint,
  SectionBackground,
  SectionSettings,
} from '@/types/hero-block-designer'
import { ColumnLayoutPicker } from '@/components/admin/hero-block-designer/column-layout-picker'
import { HorizontalAlignButtons } from '@/components/admin/hero-block-designer/alignment-buttons'
import { SpacingInput, MarginInput } from '@/components/admin/hero-block-designer/spacing-input'

// ---------------------------------------------------------------------------
// SectionSettingsPanel — Right panel when a section is selected
// ---------------------------------------------------------------------------

interface SectionSettingsPanelProps {
  section: BlockSection
  breakpoint: Breakpoint
  onUpdateSettings: (settings: Partial<SectionSettings>) => void
  onSetColumnLayout: (widths: number[]) => void
  onRename: (label: string) => void
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

type BgTab = 'none' | SectionBackground['type']

export function SectionSettingsPanel({
  section,
  breakpoint,
  onUpdateSettings,
  onSetColumnLayout,
  onRename,
}: SectionSettingsPanelProps) {
  const settings = section.settings
  const bg = settings.background
  const currentBgTab: BgTab = bg.type ?? 'none'

  const columnWidths = section.columns.map((c) => c.width)

  function setBgTab(tab: BgTab) {
    if (tab === 'none') {
      onUpdateSettings({
        background: { type: 'color', color: 'transparent' },
      })
    } else {
      onUpdateSettings({
        background: { ...bg, type: tab },
      })
    }
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="border-b border-zinc-800 px-3 py-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={section.label}
            onChange={(e) => onRename(e.target.value)}
            className="flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-zinc-100 outline-none hover:border-zinc-700 focus:border-blue-500 focus:bg-zinc-800"
          />
        </div>
        <p className="mt-0.5 text-xs text-zinc-500">
          Section &middot; {section.columns.length} col{section.columns.length !== 1 ? 's' : ''} &middot; {breakpoint}
        </p>
      </div>

      {/* Column Layout */}
      <CollapsibleSection title="Column Layout">
        <div className="space-y-3">
          <ColumnLayoutPicker
            currentWidths={columnWidths}
            onChange={onSetColumnLayout}
          />

          {/* Individual column width inputs */}
          <div className="space-y-1">
            <span className="text-xs text-zinc-400">Column Widths (%)</span>
            <div className="grid grid-cols-4 gap-1">
              {columnWidths.map((w, i) => (
                <div key={i} className="flex flex-col items-center gap-0.5">
                  <input
                    type="number"
                    value={w}
                    min={5}
                    max={100}
                    onChange={(e) => {
                      const next = [...columnWidths]
                      next[i] = Number(e.target.value) || 0
                      onSetColumnLayout(next)
                    }}
                    className="w-full rounded border border-zinc-700 bg-zinc-800 px-1.5 py-1 text-center text-xs text-zinc-100 outline-none focus:border-blue-500"
                  />
                  <span className="text-[10px] text-zinc-500">C{i + 1}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* Layout */}
      <CollapsibleSection title="Layout">
        <div className="space-y-3">
          {/* Content Width */}
          <div className="space-y-1">
            <span className="text-xs text-zinc-400">Content Width</span>
            <div className="flex gap-1">
              {(['full', 'boxed'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() =>
                    onUpdateSettings({
                      contentWidth: mode === 'full' ? 0 : 1200,
                    })
                  }
                  className={`flex-1 rounded px-3 py-1 text-xs capitalize ${
                    (mode === 'full' && settings.contentWidth === 0) ||
                    (mode === 'boxed' && settings.contentWidth > 0)
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* Horizontal Alignment */}
          <div className="space-y-1">
            <span className="text-xs text-zinc-400">Horizontal Alignment</span>
            <HorizontalAlignButtons
              value={settings.horizontalAlign}
              onChange={(v) => onUpdateSettings({ horizontalAlign: v })}
            />
          </div>

          {/* Min Height */}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Min Height (0 = auto)</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={settings.minHeight}
                onChange={(e) =>
                  onUpdateSettings({ minHeight: Number(e.target.value) || 0 })
                }
                min={0}
                className={inputClass}
              />
              <span className="shrink-0 text-xs text-zinc-500">px</span>
            </div>
          </label>
        </div>
      </CollapsibleSection>

      {/* Background */}
      <CollapsibleSection title="Background">
        <div className="space-y-3">
          {/* Tab selector */}
          <div className="flex gap-0.5">
            {(['none', 'color', 'image', 'gradient', 'video'] as BgTab[]).map(
              (tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setBgTab(tab)}
                  className={`flex-1 rounded px-1 py-1 text-[10px] capitalize ${
                    currentBgTab === tab ||
                    (tab === 'none' && bg.type === 'color' && bg.color === 'transparent')
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  {tab}
                </button>
              ),
            )}
          </div>

          {/* Color */}
          {bg.type === 'color' && bg.color !== 'transparent' && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-400">Color</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={bg.color ?? '#000000'}
                  onChange={(e) =>
                    onUpdateSettings({
                      background: { ...bg, color: e.target.value },
                    })
                  }
                  className="h-7 w-7 cursor-pointer rounded border border-zinc-700 bg-transparent"
                />
                <input
                  type="text"
                  value={bg.color ?? ''}
                  onChange={(e) =>
                    onUpdateSettings({
                      background: { ...bg, color: e.target.value },
                    })
                  }
                  className={`flex-1 ${inputClass}`}
                />
              </div>
            </label>
          )}

          {/* Image */}
          {bg.type === 'image' && (
            <div className="space-y-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-400">Image URL</span>
                <input
                  type="text"
                  value={bg.image ?? ''}
                  onChange={(e) =>
                    onUpdateSettings({
                      background: { ...bg, image: e.target.value },
                    })
                  }
                  placeholder="https://..."
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-400">Opacity</span>
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
            </div>
          )}

          {/* Gradient */}
          {bg.type === 'gradient' && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-400">CSS Gradient</span>
              <input
                type="text"
                value={bg.gradient ?? ''}
                onChange={(e) =>
                  onUpdateSettings({
                    background: { ...bg, gradient: e.target.value },
                  })
                }
                placeholder="linear-gradient(135deg, #000 0%, #333 100%)"
                className={inputClass}
              />
            </label>
          )}

          {/* Video */}
          {bg.type === 'video' && (
            <div className="space-y-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-400">Video URL</span>
                <input
                  type="text"
                  value={bg.video ?? ''}
                  onChange={(e) =>
                    onUpdateSettings({
                      background: { ...bg, video: e.target.value },
                    })
                  }
                  placeholder="https://..."
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-400">Opacity</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  defaultValue={1}
                  className="w-full accent-blue-500"
                />
              </label>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Spacing */}
      <CollapsibleSection title="Spacing">
        <div className="space-y-3">
          <SpacingInput
            label="Padding"
            value={settings.padding}
            onChange={(padding) => onUpdateSettings({ padding })}
          />
          <MarginInput
            label="Margin"
            value={settings.margin}
            onChange={(margin) => onUpdateSettings({ margin })}
          />
        </div>
      </CollapsibleSection>
    </div>
  )
}
