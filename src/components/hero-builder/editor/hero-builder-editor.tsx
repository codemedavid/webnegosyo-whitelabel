'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type CSSProperties } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowLeft, Eye, LayoutTemplate, Layers, Loader2, Monitor, MoreHorizontal, Palette, PanelLeft, PanelRight,
  Plus, Redo2, Rocket, Smartphone, Tablet, Undo2, X,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { publishHeroDesignAction, unpublishHeroDesignAction } from '@/app/actions/hero-builder'
import { CANVAS_WIDTH, THEME_COLOR_FALLBACK, THEME_COLOR_KEYS } from '@/lib/hero-builder/constants'
import { createBlankDesign } from '@/lib/hero-builder/defaults'
import { loadHeroDesign } from '@/lib/hero-builder/load'
import { cssColor } from '@/lib/hero-builder/safe-values'
import type { Device, HeroDesignV5 } from '@/lib/hero-builder/types'
import { HeroBuilderRenderer } from '@/components/hero-builder/renderer/hero-builder-renderer'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { Canvas } from './canvas'
import { Inspector } from './inspector/inspector'
import { AddPanel } from './panels/add-panel'
import { LayersPanel } from './panels/layers-panel'
import { ThemePanel } from './panels/theme-panel'
import { TemplateGallery } from './template-gallery'
import { useHeroBuilder } from './use-hero-builder'

const DRAFT_SAVE_DELAY_MS = 800

interface HeroBuilderEditorProps {
  tenantId: string
  tenantSlug: string
  initialDesign: HeroDesignV5 | null
  /** The published custom hero is what the storefront shows right now. */
  initialIsLive: boolean
  /** Store branding CSS variables, so theme colors preview accurately. */
  brandStyle: CSSProperties
}

type LeftTab = 'add' | 'layers' | 'theme'

const DEVICES: readonly { device: Device; label: string; icon: typeof Monitor }[] = [
  { device: 'desktop', label: 'Desktop', icon: Monitor },
  { device: 'tablet', label: 'Tablet', icon: Tablet },
  { device: 'mobile', label: 'Phone', icon: Smartphone },
]

function themeVarStyle(design: HeroDesignV5): CSSProperties {
  const vars: Record<string, string> = {}
  for (const key of THEME_COLOR_KEYS) {
    const custom = cssColor(design.theme.colors[key])
    vars[`--hb-${key}`] = custom && !custom.startsWith('var(--hb-') ? custom : THEME_COLOR_FALLBACK[key]
  }
  return vars as CSSProperties
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

export function HeroBuilderEditor({ tenantId, tenantSlug, initialDesign, initialIsLive, brandStyle }: HeroBuilderEditorProps) {
  const start = useMemo(() => initialDesign ?? createBlankDesign(), [initialDesign])
  const api = useHeroBuilder(start)
  const [leftTab, setLeftTab] = useState<LeftTab>(initialDesign?.sections.length ? 'layers' : 'add')
  const [showTemplates, setShowTemplates] = useState(!initialDesign?.sections.length)
  const [showPreview, setShowPreview] = useState(false)
  const [previewDevice, setPreviewDevice] = useState<Device>('desktop')
  const [contentRequest, setContentRequest] = useState(0)
  const [panels, setPanels] = useState({ left: false, right: false })
  const [isLive, setIsLive] = useState(initialIsLive)
  const [publishedJson, setPublishedJson] = useState(() => (initialIsLive ? JSON.stringify(start) : null))
  const [isPending, startTransition] = useTransition()
  const draftKey = `hb-draft:${tenantId}`

  const designJson = useMemo(() => JSON.stringify(api.design), [api.design])
  const hasUnpublishedChanges = designJson !== (publishedJson ?? JSON.stringify(start))

  // ── Crash-safe local draft ────────────────────────────────────────────────
  const offeredDraft = useRef(false)
  useEffect(() => {
    if (offeredDraft.current) return
    offeredDraft.current = true
    let saved: string | null = null
    try {
      saved = window.localStorage.getItem(draftKey)
    } catch {
      return
    }
    const draft = saved ? loadHeroDesign(saved) : null
    if (!draft || JSON.stringify(draft) === JSON.stringify(start)) return
    toast('You have unsaved work from last time', {
      duration: 15_000,
      action: { label: 'Restore', onClick: () => api.replaceDesign(draft) },
    })
  }, [api, draftKey, start])

  useEffect(() => {
    if (!hasUnpublishedChanges) return
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(draftKey, designJson)
      } catch {
        // Storage full or blocked — the draft is a convenience, publishing still works.
      }
    }, DRAFT_SAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [designJson, draftKey, hasUnpublishedChanges])

  useEffect(() => {
    if (!hasUnpublishedChanges) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasUnpublishedChanges])

  // ── Publishing ────────────────────────────────────────────────────────────
  const publish = useCallback(() => {
    startTransition(async () => {
      const result = await publishHeroDesignAction(tenantId, tenantSlug, api.design)
      if (!result.success) {
        toast.error(result.error ?? 'Could not publish')
        return
      }
      setPublishedJson(JSON.stringify(api.design))
      setIsLive(true)
      try {
        window.localStorage.removeItem(draftKey)
      } catch {
        // ignore
      }
      toast.success('Published — your storefront hero is live')
    })
  }, [api.design, draftKey, tenantId, tenantSlug])

  const unpublish = useCallback(() => {
    startTransition(async () => {
      const result = await unpublishHeroDesignAction(tenantId, tenantSlug)
      if (!result.success) {
        toast.error(result.error ?? 'Could not update the storefront')
        return
      }
      setIsLive(false)
      toast.success('Removed from the storefront. Your design is kept here.')
    })
  }, [tenantId, tenantSlug])

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault()
        publish()
        return
      }
      if (isEditableTarget(event.target)) return
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) api.redo()
        else api.undo()
      } else if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        api.redo()
      } else if (mod && event.key.toLowerCase() === 'd' && api.selectedId) {
        event.preventDefault()
        api.duplicate(api.selectedId)
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && api.selectedId) {
        event.preventDefault()
        api.remove(api.selectedId)
      } else if (event.key === 'Escape') {
        api.select(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [api, publish])

  const status = !isLive
    ? { label: 'Not live', className: 'bg-neutral-100 text-neutral-600' }
    : hasUnpublishedChanges
      ? { label: 'Unpublished changes', className: 'bg-amber-100 text-amber-800' }
      : { label: 'Live', className: 'bg-emerald-100 text-emerald-800' }

  const rootStyle = { ...brandStyle, ...themeVarStyle(api.design) }

  return (
    <div className="flex h-dvh flex-col bg-neutral-50 text-neutral-900" style={rootStyle}>
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-neutral-200 bg-white px-3">
        <Link href={`/${tenantSlug}/admin`} className="flex h-9 items-center gap-1.5 rounded-md px-2 text-sm text-neutral-600 hover:bg-neutral-100" title="Back to admin">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden font-semibold text-neutral-900 md:inline">Hero Builder</span>
        </Link>
        <span className={cn('hidden rounded-full px-2 py-0.5 text-[11px] font-semibold sm:inline', status.className)}>{status.label}</span>
        <button type="button" onClick={() => setPanels((p) => ({ ...p, left: !p.left }))} className="rounded-md p-2 text-neutral-600 hover:bg-neutral-100 lg:hidden" aria-label="Toggle elements panel">
          <PanelLeft className="h-4 w-4" />
        </button>

        <div className="mx-auto flex items-center gap-1 rounded-lg bg-neutral-100 p-1" role="radiogroup" aria-label="Device">
          {DEVICES.map(({ device, label, icon: Icon }) => (
            <button
              key={device}
              type="button"
              role="radio"
              aria-checked={api.device === device}
              title={`${label} (${CANVAS_WIDTH[device]}px)`}
              onClick={() => api.setDevice(device)}
              className={cn('flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition', api.device === device ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900')}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">{label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <button type="button" onClick={api.undo} disabled={!api.canUndo} title="Undo (⌘Z)" aria-label="Undo" className="rounded-md p-2 text-neutral-600 hover:bg-neutral-100 disabled:opacity-30">
            <Undo2 className="h-4 w-4" />
          </button>
          <button type="button" onClick={api.redo} disabled={!api.canRedo} title="Redo (⌘⇧Z)" aria-label="Redo" className="rounded-md p-2 text-neutral-600 hover:bg-neutral-100 disabled:opacity-30">
            <Redo2 className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setShowTemplates(true)} className="hidden h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-100 md:flex">
            <LayoutTemplate className="h-4 w-4" /> Templates
          </button>
          <button
            type="button"
            onClick={() => {
              setPreviewDevice(api.device)
              setShowPreview(true)
            }}
            className="flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            <Eye className="h-4 w-4" /> <span className="hidden sm:inline">Preview</span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger className="rounded-md p-2 text-neutral-600 hover:bg-neutral-100" aria-label="More">
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => setShowTemplates(true)} className="md:hidden">Templates…</DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={`/${tenantSlug}/menu`} target="_blank" rel="noopener noreferrer">View live storefront</a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!isLive || isPending} onClick={unpublish}>Remove from storefront</DropdownMenuItem>
              <DropdownMenuItem
                className="text-red-600"
                onClick={() => {
                  api.replaceDesign(createBlankDesign())
                  toast('Started over. Undo brings your design back; nothing changes on the storefront until you publish.')
                }}
              >
                Start over (blank)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            onClick={publish}
            disabled={isPending || api.design.sections.length === 0 || (isLive && !hasUnpublishedChanges)}
            className="flex h-9 items-center gap-1.5 rounded-md bg-neutral-900 px-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:bg-neutral-300"
            title="Publish (⌘S)"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            {isLive && !hasUnpublishedChanges ? 'Published' : 'Publish'}
          </button>
          <button type="button" onClick={() => setPanels((p) => ({ ...p, right: !p.right }))} className="rounded-md p-2 text-neutral-600 hover:bg-neutral-100 lg:hidden" aria-label="Toggle settings panel">
            <PanelRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* ── Left rail ───────────────────────────────────────────────── */}
        <aside
          className={cn(
            'z-40 flex w-[272px] shrink-0 flex-col border-r border-neutral-200 bg-white',
            'max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:shadow-xl max-lg:transition-transform',
            panels.left ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full',
          )}
        >
          <div role="tablist" className="grid shrink-0 grid-cols-3 border-b border-neutral-200 p-1.5">
            {([
              { tab: 'add', label: 'Add', icon: Plus },
              { tab: 'layers', label: 'Layers', icon: Layers },
              { tab: 'theme', label: 'Theme', icon: Palette },
            ] as const).map(({ tab, label, icon: Icon }) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={leftTab === tab}
                onClick={() => setLeftTab(tab)}
                className={cn('flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-semibold transition', leftTab === tab ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100')}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {leftTab === 'add' && <AddPanel api={api} />}
            {leftTab === 'layers' && <LayersPanel api={api} />}
            {leftTab === 'theme' && <ThemePanel api={api} />}
          </div>
        </aside>

        {/* ── Canvas ──────────────────────────────────────────────────── */}
        <main className="min-w-0 flex-1" onClick={() => setPanels({ left: false, right: false })}>
          <Canvas
            api={api}
            onEditContent={() => setContentRequest((n) => n + 1)}
            onOpenAdd={() => setShowTemplates(true)}
          />
        </main>

        {/* ── Inspector ───────────────────────────────────────────────── */}
        <aside
          className={cn(
            'z-40 w-[300px] shrink-0 border-l border-neutral-200 bg-white',
            'max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:shadow-xl max-lg:transition-transform',
            panels.right || api.selectedId ? 'max-lg:translate-x-0' : 'max-lg:translate-x-full',
          )}
        >
          <Inspector api={api} contentRequest={contentRequest} />
        </aside>
      </div>

      <TemplateGallery
        open={showTemplates}
        onOpenChange={setShowTemplates}
        hasContent={api.design.sections.length > 0}
        onPick={(design) => {
          api.replaceDesign(design)
          setLeftTab('layers')
        }}
      />

      {showPreview && (
        <div className="fixed inset-0 z-50 flex flex-col bg-neutral-900/95" role="dialog" aria-label="Preview">
          <div className="flex h-14 shrink-0 items-center justify-between px-4 text-white">
            <p className="text-sm font-semibold">Preview</p>
            <div className="flex gap-1 rounded-lg bg-white/10 p-1">
              {DEVICES.map(({ device, label, icon: Icon }) => (
                <button
                  key={device}
                  type="button"
                  onClick={() => setPreviewDevice(device)}
                  aria-pressed={previewDevice === device}
                  className={cn('flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium', previewDevice === device ? 'bg-white text-neutral-900' : 'text-white/80 hover:text-white')}
                >
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setShowPreview(false)} className="rounded-md p-2 hover:bg-white/10" aria-label="Close preview">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-4 pb-6">
            <div
              className="mx-auto overflow-hidden rounded-xl bg-[var(--brand-background,#fff)] shadow-2xl transition-[width] duration-300"
              style={{ width: previewDevice === 'desktop' ? '100%' : CANVAS_WIDTH[previewDevice], maxWidth: '100%' }}
            >
              <HeroBuilderRenderer design={api.design} />
              <div className="flex h-40 items-center justify-center border-t border-dashed border-neutral-200 text-xs text-neutral-400">
                Your menu continues here
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
