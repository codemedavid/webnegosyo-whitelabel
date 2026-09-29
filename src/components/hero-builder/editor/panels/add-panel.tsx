'use client'

import {
  BadgeCheck, Code2, Columns3, Film, Heading1, Image as ImageIcon, Images, List, Minus, MousePointerClick,
  MoveVertical, Puzzle, Star, Timer, Type,
  type LucideIcon,
} from 'lucide-react'

import { COLUMN_LAYOUTS, createSection } from '@/lib/hero-builder/defaults'
import { SECTION_PRESETS } from '@/lib/hero-builder/section-presets'
import type { WidgetKind } from '@/lib/hero-builder/types'

import { DRAG_NEW } from '../canvas'
import type { HeroBuilderApi } from '../use-hero-builder'

interface Tile {
  kind: WidgetKind
  label: string
  icon: LucideIcon
}

const GROUPS: readonly { title: string; tiles: readonly Tile[] }[] = [
  {
    title: 'Basic',
    tiles: [
      { kind: 'heading', label: 'Heading', icon: Heading1 },
      { kind: 'text', label: 'Text', icon: Type },
      { kind: 'buttons', label: 'Buttons', icon: MousePointerClick },
      { kind: 'image', label: 'Image', icon: ImageIcon },
      { kind: 'video', label: 'Video', icon: Film },
      { kind: 'icon', label: 'Icon', icon: Star },
    ],
  },
  {
    title: 'Content',
    tiles: [
      { kind: 'icon-list', label: 'Icon list', icon: List },
      { kind: 'badge', label: 'Badge', icon: BadgeCheck },
      { kind: 'countdown', label: 'Countdown', icon: Timer },
      { kind: 'gallery', label: 'Gallery', icon: Images },
      { kind: 'divider', label: 'Divider', icon: Minus },
      { kind: 'spacer', label: 'Spacer', icon: MoveVertical },
    ],
  },
  {
    title: 'Custom code',
    tiles: [
      { kind: 'html', label: 'HTML & CSS', icon: Code2 },
      { kind: 'embed', label: 'Embed', icon: Puzzle },
    ],
  },
]

export function AddPanel({ api }: { api: HeroBuilderApi }) {
  return (
    <div className="space-y-6 p-4">
      <p className="text-[11px] leading-relaxed text-neutral-500">
        Drag an element onto the canvas, or click to add it after the selection.
      </p>
      {GROUPS.map((group) => (
        <section key={group.title}>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">{group.title}</h3>
          <div className="grid grid-cols-3 gap-2">
            {group.tiles.map(({ kind, label, icon: Icon }) => (
              <button
                key={kind}
                type="button"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(DRAG_NEW, kind)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                onClick={() => api.addWidget(kind)}
                className="group flex aspect-square cursor-grab flex-col items-center justify-center gap-1.5 rounded-lg border border-neutral-200 bg-white text-neutral-600 transition hover:-translate-y-px hover:border-neutral-300 hover:text-neutral-900 hover:shadow-sm active:cursor-grabbing"
              >
                <Icon className="h-5 w-5 transition group-hover:scale-110" />
                <span className="text-[11px] font-medium">{label}</span>
              </button>
            ))}
          </div>
        </section>
      ))}

      <section>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">Empty section</h3>
        <div className="grid grid-cols-4 gap-1.5">
          {COLUMN_LAYOUTS.map((layout) => (
            <button
              key={layout.id}
              type="button"
              title={layout.label}
              onClick={() => api.addSection(createSection(layout.widths))}
              className="flex h-10 gap-0.5 rounded-md border border-neutral-200 bg-white p-1.5 hover:border-neutral-400"
            >
              {layout.widths.map((w, i) => (
                <span key={i} className="h-full rounded-sm bg-neutral-200" style={{ flex: w }} />
              ))}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
          <Columns3 className="h-3.5 w-3.5" /> Ready-made sections
        </h3>
        <div className="space-y-1.5">
          {SECTION_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => api.addSection(preset.build())}
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-left transition hover:border-neutral-300 hover:shadow-sm"
            >
              <span className="block text-xs font-semibold text-neutral-900">{preset.name}</span>
              <span className="block text-[11px] leading-snug text-neutral-500">{preset.description}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
