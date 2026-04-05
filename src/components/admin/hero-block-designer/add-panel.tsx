'use client'

import {
  Type,
  ImageIcon,
  MousePointer2,
  Square,
  Minus,
  MoveVertical,
  Star,
  Play,
  Timer,
  Award,
  Palette,
  type LucideIcon,
} from 'lucide-react'

import { COLUMN_PRESETS } from '@/lib/hero-block-defaults'
import type { BlockWidgetType } from '@/types/hero-block-designer'

// ── Icon map ────────────────────────────────────────────────────────────────

const WIDGET_ICON_MAP: Record<BlockWidgetType, LucideIcon> = {
  text: Type,
  image: ImageIcon,
  button: MousePointer2,
  shape: Square,
  divider: Minus,
  spacer: MoveVertical,
  icon: Star,
  video: Play,
  countdown: Timer,
  'social-proof': Award,
  'animated-bg': Palette,
}

// ── Widget definitions ──────────────────────────────────────────────────────

interface WidgetDefinition {
  type: BlockWidgetType
  label: string
}

const WIDGET_TYPES: WidgetDefinition[] = [
  { type: 'text', label: 'Text' },
  { type: 'image', label: 'Image' },
  { type: 'button', label: 'Button' },
  { type: 'video', label: 'Video' },
  { type: 'divider', label: 'Divider' },
  { type: 'spacer', label: 'Spacer' },
  { type: 'icon', label: 'Icon' },
  { type: 'shape', label: 'Shape' },
  { type: 'countdown', label: 'Countdown' },
  { type: 'social-proof', label: 'Social Proof' },
  { type: 'animated-bg', label: 'Animated BG' },
]

// ── Props ───────────────────────────────────────────────────────────────────

interface AddPanelProps {
  onAddWidget: (type: BlockWidgetType) => void
  onAddSection: (widths: number[]) => void
}

// ── Component ───────────────────────────────────────────────────────────────

export function AddPanel({ onAddWidget, onAddSection }: AddPanelProps) {
  return (
    <div className="space-y-5">
      {/* Widgets section */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Widgets
        </p>
        <div className="grid grid-cols-2 gap-2">
          {WIDGET_TYPES.map((widget) => {
            const Icon = WIDGET_ICON_MAP[widget.type]
            return (
              <button
                key={widget.type}
                type="button"
                onClick={() => onAddWidget(widget.type)}
                className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card p-3 text-sm transition-colors hover:border-primary/40 hover:bg-accent"
              >
                <Icon className="h-5 w-5 text-muted-foreground" />
                <span className="text-xs font-medium">{widget.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Sections section */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Sections
        </p>
        <div className="grid grid-cols-3 gap-2">
          {COLUMN_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onAddSection(preset.widths)}
              className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card p-3 text-xs transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <div className="flex h-8 w-full items-end gap-0.5">
                {preset.widths.map((w, i) => (
                  <div
                    key={i}
                    className="rounded-sm bg-muted-foreground/40"
                    style={{ width: `${w}%`, height: '100%' }}
                  />
                ))}
              </div>
              <span className="font-medium">{preset.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
