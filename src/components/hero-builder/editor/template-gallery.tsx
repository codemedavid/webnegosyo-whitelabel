'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'

import { HERO_TEMPLATE_CATEGORIES, HERO_TEMPLATES } from '@/lib/hero-builder/templates'
import type { HeroDesignV5 } from '@/lib/hero-builder/types'
import { HeroBuilderRenderer } from '@/components/hero-builder/renderer/hero-builder-renderer'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

const FALLBACK_SCALE = 0.25
const ALL = 'all'

/** Any builder's starting design: the hero's, the welcome page's, … */
export interface GalleryTemplate {
  id: string
  name: string
  description: string
  category: string
  build: () => HeroDesignV5
}

/** How thumbnails are drawn: the real design at `width`, scaled into the card. */
export interface GalleryPreview {
  width: number
  /** Tailwind aspect class for the thumbnail frame. */
  aspectClass: string
  /** Px height "fill the screen" sections take inside the thumbnail. */
  viewportHeight?: number
  /** Tailwind grid-cols classes; tall phone thumbnails fit more per row. */
  gridClass?: string
}

const HERO_PREVIEW: GalleryPreview = { width: 1280, aspectClass: 'aspect-[16/10]' }
const DEFAULT_GRID = 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'

interface TemplateGalleryProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (design: HeroDesignV5) => void
  hasContent: boolean
  templates?: readonly GalleryTemplate[]
  categories?: readonly string[]
  preview?: GalleryPreview
}

export function TemplateGallery({
  open,
  onOpenChange,
  onPick,
  hasContent,
  templates = HERO_TEMPLATES,
  categories = HERO_TEMPLATE_CATEGORIES,
  preview = HERO_PREVIEW,
}: TemplateGalleryProps) {
  // One build per template for the thumbnails; picking builds a fresh copy.
  const previews = useMemo(() => (open ? templates.map((t) => ({ template: t, design: t.build() })) : []), [open, templates])
  const [filter, setFilter] = useState<string>(ALL)
  const visible = filter === ALL ? previews : previews.filter(({ template }) => template.category === filter)
  const filters = [ALL, ...categories]

  const handlePick = (template: GalleryTemplate) => {
    onPick(template.build())
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        A fixed-height flex column: header and filters keep their size and only
        the card list scrolls. (The old grid shell let the list's max-height
        squeeze every card row to ~58px, so there was nothing to scroll.)
      */}
      <DialogContent className="flex h-[90dvh] w-[calc(100vw-1rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl sm:rounded-2xl [&>button]:hidden">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4 sm:px-6">
          <div>
            <DialogTitle className="text-lg font-semibold">Start from a template</DialogTitle>
            <DialogDescription className="text-sm text-neutral-500">
              Every template adapts to phones and uses your store colors.{' '}
              {hasContent && 'Picking one replaces your current design (you can undo).'}
            </DialogDescription>
          </div>
          <button type="button" onClick={() => onOpenChange(false)} className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-neutral-100 px-5 py-3 sm:px-6" role="group" aria-label="Filter templates">
          {filters.map((option) => (
            <FilterChip key={option} option={option} total={templates.length} isActive={filter === option} onSelect={setFilter} />
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className={`grid auto-rows-max gap-5 p-5 sm:p-6 ${preview.gridClass ?? DEFAULT_GRID}`}>
            {visible.map(({ template, design }) => (
              <TemplateCard key={template.id} template={template} design={design} preview={preview} onPick={handlePick} />
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface FilterChipProps {
  option: string
  total: number
  isActive: boolean
  onSelect: (option: string) => void
}

function FilterChip({ option, total, isActive, onSelect }: FilterChipProps) {
  const label = option === ALL ? `All (${total})` : option
  return (
    <button
      type="button"
      onClick={() => onSelect(option)}
      aria-pressed={isActive}
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium capitalize transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
        isActive ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
      }`}
    >
      {label}
    </button>
  )
}

interface TemplateCardProps {
  template: GalleryTemplate
  design: HeroDesignV5
  preview: GalleryPreview
  onPick: (template: GalleryTemplate) => void
}

function TemplateCard({ template, design, preview, onPick }: TemplateCardProps) {
  // A container with one full-card button laid over it, not a <button>: the
  // preview renders the template's own links and buttons (welcome tiles), and
  // a button may not contain another.
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white text-left transition hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-lg has-[button:focus-visible]:ring-2 has-[button:focus-visible]:ring-sky-500">
      <ScaledPreview design={design} preview={preview} />
      <div className="border-t border-neutral-100 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-neutral-900">{template.name}</p>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium capitalize text-neutral-600">{template.category}</span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-neutral-500">{template.description}</p>
      </div>
      <button
        type="button"
        onClick={() => onPick(template)}
        aria-label={`Use the ${template.name} template`}
        className="absolute inset-0 rounded-xl focus-visible:outline-none"
      />
    </div>
  )
}

/** The design at the preview width, scaled to fill the card's width exactly. */
function ScaledPreview({ design, preview }: { design: HeroDesignV5; preview: GalleryPreview }) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(FALLBACK_SCALE)

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? 0
      if (width > 0) setScale(width / preview.width)
    })
    observer.observe(frame)
    return () => observer.disconnect()
  }, [preview.width])

  return (
    // `inert`: the preview renders the template's real links and buttons, which
    // must not be tab stops inside the card's own button.
    <div ref={frameRef} inert className={`pointer-events-none relative ${preview.aspectClass} w-full shrink-0 overflow-hidden bg-neutral-50`} aria-hidden="true">
      <div className="absolute left-0 top-0 origin-top-left" style={{ width: preview.width, transform: `scale(${scale})` }}>
        <HeroBuilderRenderer design={design} viewportHeight={preview.viewportHeight} />
      </div>
    </div>
  )
}
