'use client'

import { getActiveProps } from '@/lib/hero-designer-defaults'
import type { HeroElement, ElementProps, Breakpoint } from '@/types/hero-designer'

interface AppearanceSectionProps {
  element: HeroElement
  breakpoint: Breakpoint
  onUpdate: (props: Partial<ElementProps>) => void
}

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-zinc-400">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-7 cursor-pointer rounded border border-zinc-700 bg-transparent"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-blue-500"
        />
      </div>
    </label>
  )
}

export function AppearanceSection({ element, breakpoint, onUpdate }: AppearanceSectionProps) {
  const resolvedProps = getActiveProps(element, breakpoint)
  const kind = resolvedProps.kind

  // Determine which fields to show based on kind
  const hasOpacity = kind === 'shape' || kind === 'image'
  const hasBorder = kind === 'shape' || kind === 'button'
  const hasBorderRadius = kind === 'shape' || kind === 'button' || kind === 'image'
  const hasFillColor = kind === 'shape'
  const hasBackgroundColor = kind === 'button'

  return (
    <div className="space-y-3">
      {/* Opacity */}
      {hasOpacity && (
        <label className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">Opacity</span>
            <span className="text-xs text-zinc-500">
              {('opacity' in resolvedProps ? resolvedProps.opacity : 1).toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={'opacity' in resolvedProps ? resolvedProps.opacity : 1}
            onChange={(e) => onUpdate({ opacity: Number(e.target.value) } as Partial<ElementProps>)}
            className="w-full accent-blue-500"
          />
        </label>
      )}

      {/* Border Width */}
      {hasBorder && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">Border Width</span>
          <input
            type="number"
            value={'borderWidth' in resolvedProps ? resolvedProps.borderWidth : 0}
            onChange={(e) =>
              onUpdate({ borderWidth: Number(e.target.value) } as Partial<ElementProps>)
            }
            min={0}
            className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-blue-500"
          />
        </label>
      )}

      {/* Border Color */}
      {hasBorder && 'borderColor' in resolvedProps && (
        <ColorInput
          label="Border Color"
          value={resolvedProps.borderColor as string}
          onChange={(v) => onUpdate({ borderColor: v } as Partial<ElementProps>)}
        />
      )}

      {/* Border Radius */}
      {hasBorderRadius && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">Border Radius</span>
          <input
            type="number"
            value={'borderRadius' in resolvedProps ? resolvedProps.borderRadius : 0}
            onChange={(e) =>
              onUpdate({ borderRadius: Number(e.target.value) } as Partial<ElementProps>)
            }
            min={0}
            className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-blue-500"
          />
        </label>
      )}

      {/* Fill Color (shapes) */}
      {hasFillColor && 'fillColor' in resolvedProps && (
        <ColorInput
          label="Fill Color"
          value={resolvedProps.fillColor as string}
          onChange={(v) => onUpdate({ fillColor: v } as Partial<ElementProps>)}
        />
      )}

      {/* Background Color (buttons) */}
      {hasBackgroundColor && 'backgroundColor' in resolvedProps && (
        <ColorInput
          label="Background Color"
          value={resolvedProps.backgroundColor as string}
          onChange={(v) => onUpdate({ backgroundColor: v } as Partial<ElementProps>)}
        />
      )}
    </div>
  )
}
