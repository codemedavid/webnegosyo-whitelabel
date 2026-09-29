'use client'

import { useMemo } from 'react'
import { X } from 'lucide-react'

import { HERO_TEMPLATES } from '@/lib/hero-builder/templates'
import type { HeroDesignV5 } from '@/lib/hero-builder/types'
import { HeroBuilderRenderer } from '@/components/hero-builder/renderer/hero-builder-renderer'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

const PREVIEW_WIDTH = 1280
const PREVIEW_SCALE = 0.25

interface TemplateGalleryProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (design: HeroDesignV5) => void
  hasContent: boolean
}

export function TemplateGallery({ open, onOpenChange, onPick, hasContent }: TemplateGalleryProps) {
  // One build per template for the thumbnails; picking builds a fresh copy.
  const previews = useMemo(() => (open ? HERO_TEMPLATES.map((t) => ({ template: t, design: t.build() })) : []), [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-5xl overflow-hidden p-0 sm:rounded-2xl [&>button]:hidden">
        <div className="flex items-start justify-between border-b border-neutral-200 px-6 py-4">
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
        <div className="grid max-h-[calc(88vh-80px)] grid-cols-1 gap-5 overflow-y-auto p-6 sm:grid-cols-2 lg:grid-cols-3">
          {previews.map(({ template, design }) => (
            <button
              key={template.id}
              type="button"
              onClick={() => {
                onPick(template.build())
                onOpenChange(false)
              }}
              className="group overflow-hidden rounded-xl border border-neutral-200 bg-white text-left transition hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              <div className="pointer-events-none relative h-44 overflow-hidden bg-neutral-50" aria-hidden="true">
                <div className="absolute left-0 top-0 origin-top-left" style={{ width: PREVIEW_WIDTH, transform: `scale(${PREVIEW_SCALE})` }}>
                  <HeroBuilderRenderer design={design} />
                </div>
              </div>
              <div className="border-t border-neutral-100 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-neutral-900">{template.name}</p>
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium capitalize text-neutral-600">{template.category}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-neutral-500">{template.description}</p>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
