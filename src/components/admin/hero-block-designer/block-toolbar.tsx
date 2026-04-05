'use client'

import Link from 'next/link'
import {
  ArrowLeft,
  Eye,
  LayoutTemplate,
  Loader2,
  Monitor,
  Redo2,
  RotateCcw,
  Save,
  Smartphone,
  Tablet,
  Undo2,
} from 'lucide-react'

import { Switch } from '@/components/ui/switch'
import type { Breakpoint } from '@/types/hero-block-designer'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BlockToolbarProps {
  tenantSlug: string
  breakpoint: Breakpoint
  canUndo: boolean
  canRedo: boolean
  isSaving: boolean
  hasUnsavedChanges: boolean
  heroSectionEnabled: boolean
  onToggleHeroSection: (enabled: boolean) => void
  onUndo: () => void
  onRedo: () => void
  onSetBreakpoint: (bp: Breakpoint) => void
  onSave: () => void
  onReset: () => void
  onPreview: () => void
  onOpenTemplates: () => void
}

// ---------------------------------------------------------------------------
// Breakpoint options
// ---------------------------------------------------------------------------

const BREAKPOINTS: { id: Breakpoint; icon: typeof Monitor; label: string }[] = [
  { id: 'desktop', icon: Monitor, label: 'Desktop' },
  { id: 'tablet', icon: Tablet, label: 'Tablet' },
  { id: 'mobile', icon: Smartphone, label: 'Mobile' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BlockToolbar({
  tenantSlug,
  breakpoint,
  canUndo,
  canRedo,
  isSaving,
  hasUnsavedChanges,
  heroSectionEnabled,
  onToggleHeroSection,
  onUndo,
  onRedo,
  onSetBreakpoint,
  onSave,
  onReset,
  onPreview,
  onOpenTemplates,
}: BlockToolbarProps) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b bg-white px-4">
      {/* ── Left group ──────────────────────────────────────────────────── */}
      <Link
        href={`/${tenantSlug}/admin`}
        className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100"
        aria-label="Back to admin"
      >
        <ArrowLeft className="h-4 w-4" />
      </Link>

      <span className="text-sm font-semibold text-gray-900">Hero Designer</span>

      <div className="flex items-center gap-2">
        <Switch
          checked={heroSectionEnabled}
          onCheckedChange={onToggleHeroSection}
          aria-label="Toggle hero section visibility"
        />
        <span className="text-xs text-gray-500">
          {heroSectionEnabled ? 'Visible' : 'Hidden'}
        </span>
      </div>

      {/* ── Center group ────────────────────────────────────────────────── */}
      <div className="h-6 border-l border-gray-200" />

      <button
        onClick={onUndo}
        disabled={!canUndo}
        className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-40"
        aria-label="Undo"
        title="Undo"
      >
        <Undo2 className="h-4 w-4" />
      </button>

      <button
        onClick={onRedo}
        disabled={!canRedo}
        className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-40"
        aria-label="Redo"
        title="Redo"
      >
        <Redo2 className="h-4 w-4" />
      </button>

      <div className="h-6 border-l border-gray-200" />

      {/* Breakpoint switcher */}
      {BREAKPOINTS.map((bp) => {
        const Icon = bp.icon
        const isActive = bp.id === breakpoint
        return (
          <button
            key={bp.id}
            onClick={() => onSetBreakpoint(bp.id)}
            className={`rounded-md p-1.5 transition-colors ${
              isActive
                ? 'bg-blue-50 text-blue-600'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
            aria-label={bp.label}
            title={bp.label}
          >
            <Icon className="h-4 w-4" />
          </button>
        )
      })}

      {/* ── Right group ─────────────────────────────────────────────────── */}
      <div className="flex-1" />

      <button
        onClick={onOpenTemplates}
        className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100"
        aria-label="Templates"
        title="Templates"
      >
        <LayoutTemplate className="h-4 w-4" />
      </button>

      <button
        onClick={onPreview}
        className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100"
        aria-label="Preview"
        title="Preview"
      >
        <Eye className="h-4 w-4" />
      </button>

      <button
        onClick={onSave}
        disabled={isSaving}
        className="relative inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        Save
        {hasUnsavedChanges && !isSaving && (
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-yellow-400" />
        )}
      </button>

      <button
        onClick={onReset}
        className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-40"
        aria-label="Reset"
        title="Reset"
      >
        <RotateCcw className="h-4 w-4" />
      </button>
    </div>
  )
}
