'use client'

import {
  Type,
  ImageIcon,
  MousePointer2,
  Square,
  Minus,
  Star,
  Play,
  Timer,
  Award,
  Palette,
  type LucideIcon,
} from 'lucide-react'
import type { HeroElementType } from '@/types/hero-designer'

// ── Icon map ────────────────────────────────────────────────────────────────

const ICON_MAP: Record<HeroElementType, LucideIcon> = {
  text: Type,
  image: ImageIcon,
  button: MousePointer2,
  shape: Square,
  divider: Minus,
  icon: Star,
  video: Play,
  countdown: Timer,
  'social-proof': Award,
  'animated-bg': Palette,
}

// ── Element definitions ─────────────────────────────────────────────────────

interface ElementBlock {
  type: HeroElementType
  label: string
}

const CORE_ELEMENTS: ElementBlock[] = [
  { type: 'text', label: 'Text' },
  { type: 'image', label: 'Image' },
  { type: 'button', label: 'Button' },
  { type: 'shape', label: 'Shape' },
  { type: 'divider', label: 'Divider' },
  { type: 'icon', label: 'Icon' },
]

const EXTENDED_ELEMENTS: ElementBlock[] = [
  { type: 'video', label: 'Video' },
  { type: 'countdown', label: 'Countdown' },
  { type: 'social-proof', label: 'Social Proof' },
  { type: 'animated-bg', label: 'Animated BG' },
]

// ── Component ───────────────────────────────────────────────────────────────

interface ElementPanelProps {
  onAddElement: (type: HeroElementType) => void
}

export function ElementPanel({ onAddElement }: ElementPanelProps) {
  return (
    <div className="space-y-4">
      <Section title="Core Elements" elements={CORE_ELEMENTS} onAdd={onAddElement} />
      <Section title="Extended Elements" elements={EXTENDED_ELEMENTS} onAdd={onAddElement} />
    </div>
  )
}

function Section({
  title,
  elements,
  onAdd,
}: {
  title: string
  elements: ElementBlock[]
  onAdd: (type: HeroElementType) => void
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {elements.map((el) => {
          const Icon = ICON_MAP[el.type]
          return (
            <button
              key={el.type}
              type="button"
              onClick={() => onAdd(el.type)}
              className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card p-3 text-sm transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <Icon className="h-5 w-5 text-muted-foreground" />
              <span className="text-xs font-medium">{el.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
