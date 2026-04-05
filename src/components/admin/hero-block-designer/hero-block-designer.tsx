'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { useHeroBlockDesigner } from '@/hooks/use-hero-block-designer'
import {
  saveHeroDesignAction,
  updateHeroSectionEnabledAction,
} from '@/app/actions/hero-designer'
import { createBlankBlockDesign } from '@/lib/hero-block-defaults'
import type { BlockWidgetType, HeroBlockDesign } from '@/types/hero-block-designer'

import { BlockToolbar } from './block-toolbar'
import { AddPanel } from './add-panel'
import { BlockLayersPanel } from './layers-panel'
import { BlockCanvas } from './block-canvas'
import { SettingsPanel } from './settings-panel'
import { BlockTemplatePicker } from './template-picker'
import { BlockPreviewModal } from './preview-modal'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HeroBlockDesignerProps {
  tenantId: string
  tenantSlug: string
  initialDesign: HeroBlockDesign | null
  initialHeroSectionEnabled: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HeroBlockDesigner({
  tenantId,
  tenantSlug,
  initialDesign,
  initialHeroSectionEnabled,
}: HeroBlockDesignerProps) {
  const {
    state,
    dispatch,
    canUndo,
    canRedo,
    selectedSection,
    selectedColumn,
    selectedWidget,
    undo,
    redo,
  } = useHeroBlockDesigner(initialDesign ?? undefined)

  const [isSaving, setIsSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [heroSectionEnabled, setHeroSectionEnabled] = useState(initialHeroSectionEnabled)
  const [leftTab, setLeftTab] = useState<'add' | 'layers'>('add')

  const lastSavedRef = useRef(JSON.stringify(state.design))
  const hasUnsavedChanges = JSON.stringify(state.design) !== lastSavedRef.current

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleToggleHero = useCallback(
    async (enabled: boolean) => {
      const prev = heroSectionEnabled
      setHeroSectionEnabled(enabled)

      const result = await updateHeroSectionEnabledAction(tenantId, tenantSlug, enabled)
      if (!result.success) {
        setHeroSectionEnabled(prev)
        toast.error(result.error ?? 'Failed to toggle hero section')
      }
    },
    [heroSectionEnabled, tenantId, tenantSlug],
  )

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    try {
      const result = await saveHeroDesignAction(
        tenantId,
        tenantSlug,
        state.design as unknown as Parameters<typeof saveHeroDesignAction>[2],
      )
      if (result.success) {
        lastSavedRef.current = JSON.stringify(state.design)
        toast.success('Design saved')
      } else {
        toast.error(result.error ?? 'Failed to save design')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsSaving(false)
    }
  }, [tenantId, tenantSlug, state.design])

  const handleReset = useCallback(async () => {
    if (!window.confirm('Reset to blank design? This cannot be undone.')) return

    setIsSaving(true)
    try {
      const result = await saveHeroDesignAction(tenantId, tenantSlug, null)
      if (result.success) {
        const blank = createBlankBlockDesign()
        dispatch({ type: 'SET_DESIGN', design: blank })
        lastSavedRef.current = JSON.stringify(blank)
        toast.success('Design reset')
      } else {
        toast.error(result.error ?? 'Failed to reset design')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsSaving(false)
    }
  }, [tenantId, tenantSlug, dispatch])

  const handleSelectTemplate = useCallback(
    (design: HeroBlockDesign) => {
      dispatch({ type: 'SET_DESIGN', design })
    },
    [dispatch],
  )

  const handleAddWidget = useCallback(
    (type: BlockWidgetType) => {
      const { selection, design } = state

      // If a column is selected (or widget within a column), add to that column
      if (selection?.columnId && selection.sectionId) {
        dispatch({
          type: 'ADD_WIDGET',
          sectionId: selection.sectionId,
          columnId: selection.columnId,
          widgetType: type,
        })
        return
      }

      // If a section is selected, add to the first column of that section
      if (selection?.sectionId) {
        const section = design.sections.find((s) => s.id === selection.sectionId)
        if (section && section.columns.length > 0) {
          dispatch({
            type: 'ADD_WIDGET',
            sectionId: section.id,
            columnId: section.columns[0].id,
            widgetType: type,
          })
          return
        }
      }

      // Otherwise, add to the first column of the last section
      const lastSection = design.sections[design.sections.length - 1]
      if (lastSection && lastSection.columns.length > 0) {
        dispatch({
          type: 'ADD_WIDGET',
          sectionId: lastSection.id,
          columnId: lastSection.columns[0].id,
          widgetType: type,
        })
        return
      }

      toast.info('Add a section first')
    },
    [state, dispatch],
  )

  const handleAddSection = useCallback(
    (widths: number[]) => {
      dispatch({ type: 'ADD_SECTION', columnWidths: widths })
    },
    [dispatch],
  )

  // ── Keyboard shortcuts ───────────────────────────────────────────────────

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const tagName = target.tagName
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
        return
      }

      const isCtrl = e.ctrlKey || e.metaKey

      // Delete / Backspace: Remove selected widget or section
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const { selection } = state
        if (!selection) return
        e.preventDefault()

        if (selection.type === 'widget' && selection.widgetId && selection.columnId) {
          dispatch({
            type: 'REMOVE_WIDGET',
            sectionId: selection.sectionId,
            columnId: selection.columnId,
            widgetId: selection.widgetId,
          })
        } else if (selection.type === 'section') {
          dispatch({ type: 'REMOVE_SECTION', sectionId: selection.sectionId })
        }
        return
      }

      // Ctrl+Z: Undo
      if (isCtrl && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }

      // Ctrl+Shift+Z or Ctrl+Y: Redo
      if ((isCtrl && e.key === 'z' && e.shiftKey) || (isCtrl && e.key === 'y')) {
        e.preventDefault()
        redo()
        return
      }

      // Ctrl+D: Duplicate selected widget or section
      if (isCtrl && e.key === 'd') {
        const { selection } = state
        if (!selection) return
        e.preventDefault()

        if (selection.type === 'widget' && selection.widgetId && selection.columnId) {
          dispatch({
            type: 'DUPLICATE_WIDGET',
            sectionId: selection.sectionId,
            columnId: selection.columnId,
            widgetId: selection.widgetId,
          })
        } else if (selection.type === 'section') {
          dispatch({ type: 'DUPLICATE_SECTION', sectionId: selection.sectionId })
        }
        return
      }

      // Escape: Move selection up one level
      if (e.key === 'Escape') {
        const { selection } = state
        if (!selection) return
        e.preventDefault()

        if (selection.type === 'widget' && selection.columnId) {
          dispatch({
            type: 'SELECT_BLOCK',
            selection: {
              type: 'column',
              sectionId: selection.sectionId,
              columnId: selection.columnId,
            },
          })
        } else if (selection.type === 'column') {
          dispatch({
            type: 'SELECT_BLOCK',
            selection: {
              type: 'section',
              sectionId: selection.sectionId,
            },
          })
        } else if (selection.type === 'section') {
          dispatch({ type: 'SELECT_BLOCK', selection: null })
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [state, dispatch, undo, redo])

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <BlockToolbar
        tenantSlug={tenantSlug}
        breakpoint={state.activeBreakpoint}
        canUndo={canUndo}
        canRedo={canRedo}
        isSaving={isSaving}
        hasUnsavedChanges={hasUnsavedChanges}
        heroSectionEnabled={heroSectionEnabled}
        onToggleHeroSection={handleToggleHero}
        onUndo={undo}
        onRedo={redo}
        onSetBreakpoint={(bp) => dispatch({ type: 'SET_BREAKPOINT', breakpoint: bp })}
        onSave={handleSave}
        onReset={handleReset}
        onPreview={() => setShowPreview(true)}
        onOpenTemplates={() => setShowTemplates(true)}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left panel ──────────────────────────────────────────────── */}
        <div className="flex w-[280px] flex-col border-r bg-white">
          {/* Tab switcher */}
          <div className="flex border-b">
            <button
              onClick={() => setLeftTab('add')}
              className={`flex-1 px-3 py-2 text-xs font-medium uppercase tracking-wider ${
                leftTab === 'add'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Add
            </button>
            <button
              onClick={() => setLeftTab('layers')}
              className={`flex-1 px-3 py-2 text-xs font-medium uppercase tracking-wider ${
                leftTab === 'layers'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Layers
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {leftTab === 'add' ? (
              <AddPanel
                onAddWidget={handleAddWidget}
                onAddSection={handleAddSection}
              />
            ) : (
              <BlockLayersPanel
                design={state.design}
                selection={state.selection}
                breakpoint={state.activeBreakpoint}
                dispatch={dispatch}
              />
            )}
          </div>
        </div>

        {/* ── Center: Canvas ──────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden">
          <BlockCanvas
            design={state.design}
            breakpoint={state.activeBreakpoint}
            selection={state.selection}
            dispatch={dispatch}
          />
        </div>

        {/* ── Right: Settings ─────────────────────────────────────────── */}
        <SettingsPanel
          design={state.design}
          selection={state.selection}
          breakpoint={state.activeBreakpoint}
          selectedSection={selectedSection}
          selectedColumn={selectedColumn}
          selectedWidget={selectedWidget}
          dispatch={dispatch}
        />
      </div>

      <BlockTemplatePicker
        isOpen={showTemplates}
        onClose={() => setShowTemplates(false)}
        onSelectTemplate={handleSelectTemplate}
      />

      <BlockPreviewModal
        design={state.design}
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
      />
    </div>
  )
}

export default HeroBlockDesigner
