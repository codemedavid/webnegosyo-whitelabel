'use client'

import Link from 'next/link'
import {
  ArrowLeft,
  Eye,
  Grid3X3,
  LayoutTemplate,
  Loader2,
  Maximize,
  Monitor,
  Redo2,
  RotateCcw,
  Save,
  Smartphone,
  Square,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import type { Breakpoint, HeroLayoutMode } from '@/types/hero-designer'

const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const

interface DesignerToolbarProps {
  tenantSlug: string
  breakpoint: Breakpoint
  layoutMode: HeroLayoutMode
  canUndo: boolean
  canRedo: boolean
  zoom: number
  showGrid: boolean
  isSaving: boolean
  hasUnsavedChanges: boolean
  heroSectionEnabled: boolean
  onToggleHeroSection: (enabled: boolean) => void
  onUndo: () => void
  onRedo: () => void
  onSetBreakpoint: (bp: Breakpoint) => void
  onSetLayoutMode: (mode: HeroLayoutMode) => void
  onSetZoom: (zoom: number) => void
  onToggleGrid: () => void
  onSave: () => void
  onReset: () => void
  onPreview: () => void
  onOpenTemplates: () => void
}

function stepZoom(current: number, direction: 'in' | 'out'): number {
  const idx = ZOOM_STEPS.indexOf(current as (typeof ZOOM_STEPS)[number])
  if (direction === 'in') {
    return idx < ZOOM_STEPS.length - 1 ? ZOOM_STEPS[idx + 1] : current
  }
  return idx > 0 ? ZOOM_STEPS[idx - 1] : current
}

export function DesignerToolbar({
  tenantSlug,
  breakpoint,
  layoutMode,
  canUndo,
  canRedo,
  zoom,
  showGrid,
  isSaving,
  hasUnsavedChanges,
  heroSectionEnabled,
  onToggleHeroSection,
  onUndo,
  onRedo,
  onSetBreakpoint,
  onSetLayoutMode,
  onSetZoom,
  onToggleGrid,
  onSave,
  onReset,
  onPreview,
  onOpenTemplates,
}: DesignerToolbarProps) {
  return (
    <div className="flex h-14 w-full items-center border-b bg-white px-4">
      {/* Left group */}
      <div className="flex items-center gap-3">
        <Link
          href={`/${tenantSlug}/admin/settings`}
          className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <span className="text-lg font-semibold">Hero Designer</span>
        <div className="mx-1 h-6 border-l border-gray-200" />
        <label className="flex items-center gap-2 cursor-pointer">
          <Switch
            checked={heroSectionEnabled}
            onCheckedChange={onToggleHeroSection}
          />
          <span className="text-sm text-gray-600">
            {heroSectionEnabled ? 'Visible' : 'Hidden'}
          </span>
        </label>
      </div>

      {/* Center group */}
      <div className="flex flex-1 items-center justify-center gap-2">
        <button onClick={onUndo} disabled={!canUndo} className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-40">
          <Undo2 className="h-4 w-4" />
        </button>
        <button onClick={onRedo} disabled={!canRedo} className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-40">
          <Redo2 className="h-4 w-4" />
        </button>

        <div className="mx-1 h-6 border-l border-gray-200" />

        <button
          onClick={() => onSetBreakpoint('desktop')}
          className={`rounded-md p-1.5 ${breakpoint === 'desktop' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          <Monitor className="h-4 w-4" />
        </button>
        <button
          onClick={() => onSetBreakpoint('mobile')}
          className={`rounded-md p-1.5 ${breakpoint === 'mobile' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          <Smartphone className="h-4 w-4" />
        </button>

        <div className="mx-1 h-6 border-l border-gray-200" />

        <button
          onClick={onToggleGrid}
          className={`rounded-md p-1.5 ${showGrid ? 'text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          <Grid3X3 className="h-4 w-4" />
        </button>

        <div className="mx-1 h-6 border-l border-gray-200" />

        {/* Layout mode toggle */}
        <div className="flex items-center rounded-md border border-gray-200 p-0.5">
          <button
            onClick={() => onSetLayoutMode('boxed')}
            title="Boxed layout"
            className={`rounded px-2 py-1 text-xs font-medium transition-colors ${layoutMode === 'boxed' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
          >
            <Square className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onSetLayoutMode('fullscreen')}
            title="Full-screen layout"
            className={`rounded px-2 py-1 text-xs font-medium transition-colors ${layoutMode === 'fullscreen' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
          >
            <Maximize className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mx-1 h-6 border-l border-gray-200" />

        <button onClick={() => onSetZoom(stepZoom(zoom, 'out'))} disabled={zoom <= ZOOM_STEPS[0]} className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-40">
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="w-12 text-center text-sm text-gray-700">{Math.round(zoom * 100)}%</span>
        <button onClick={() => onSetZoom(stepZoom(zoom, 'in'))} disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]} className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-40">
          <ZoomIn className="h-4 w-4" />
        </button>
      </div>

      {/* Right group */}
      <div className="flex items-center gap-2">
        <button onClick={onOpenTemplates} className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
          <LayoutTemplate className="h-4 w-4" />
          Templates
        </button>
        <button onClick={onPreview} className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
          <Eye className="h-4 w-4" />
          Preview
        </button>
        <div className="relative">
          <button
            onClick={onSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
          {hasUnsavedChanges && (
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-yellow-400" />
          )}
        </div>
        <button
          onClick={() => {
            if (window.confirm('Reset all changes? This cannot be undone.')) {
              onReset()
            }
          }}
          className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
