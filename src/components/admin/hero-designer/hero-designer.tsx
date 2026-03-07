'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { DndContext, type DragEndEvent } from '@dnd-kit/core'
import { toast } from 'sonner'

import { useHeroDesigner } from '@/hooks/use-hero-designer'
import { saveHeroDesignAction } from '@/app/actions/hero-designer'
import { createBlankDesign } from '@/lib/hero-designer-defaults'
import { DesignerToolbar } from '@/components/admin/hero-designer/designer-toolbar'
import { ElementPanel } from '@/components/admin/hero-designer/element-panel'
import { LayersPanel } from '@/components/admin/hero-designer/layers-panel'
import { DesignerCanvas } from '@/components/admin/hero-designer/designer-canvas'
import { PropertiesPanel } from '@/components/admin/hero-designer/properties-panel'
import { TemplatePicker } from '@/components/admin/hero-designer/template-picker'
import { PreviewModal } from '@/components/admin/hero-designer/preview-modal'
import type { HeroDesign, HeroElementType } from '@/types/hero-designer'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HeroDesignerProps {
  tenantId: string
  tenantSlug: string
  initialDesign: HeroDesign | null
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HeroDesigner({
  tenantId,
  tenantSlug,
  initialDesign,
}: HeroDesignerProps) {
  const {
    state,
    dispatch,
    canUndo,
    canRedo,
    selectedElement,
    undo,
    redo,
  } = useHeroDesigner(initialDesign ?? undefined)

  const [isSaving, setIsSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false)

  // Track last-saved design for unsaved changes detection
  const lastSavedDesignRef = useRef<string>(JSON.stringify(initialDesign))
  const hasUnsavedChanges =
    JSON.stringify(state.design) !== lastSavedDesignRef.current

  // ---- Save handler ------------------------------------------------------
  const handleSave = useCallback(async () => {
    setIsSaving(true)
    try {
      const result = await saveHeroDesignAction(
        tenantId,
        tenantSlug,
        state.design,
      )
      if (result.success) {
        lastSavedDesignRef.current = JSON.stringify(state.design)
        toast.success('Hero design saved')
      } else {
        toast.error(result.error ?? 'Failed to save')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsSaving(false)
    }
  }, [tenantId, tenantSlug, state.design])

  // ---- Reset handler -----------------------------------------------------
  const handleReset = useCallback(async () => {
    setIsSaving(true)
    try {
      const result = await saveHeroDesignAction(tenantId, tenantSlug, null)
      if (result.success) {
        const blank = createBlankDesign()
        dispatch({ type: 'SET_DESIGN', design: blank })
        lastSavedDesignRef.current = JSON.stringify(null)
        toast.success('Design reset to default')
      } else {
        toast.error(result.error ?? 'Failed to reset')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsSaving(false)
    }
  }, [tenantId, tenantSlug, dispatch])

  // ---- Template selection ------------------------------------------------
  const handleSelectTemplate = useCallback(
    (design: HeroDesign) => {
      dispatch({ type: 'SET_DESIGN', design })
    },
    [dispatch],
  )

  // ---- DnD handler (element panel → canvas) ------------------------------
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || over.id !== 'designer-canvas-drop') return

      const elementType = active.data.current?.elementType as
        | HeroElementType
        | undefined
      if (elementType) {
        dispatch({ type: 'ADD_ELEMENT', elementType })
      }
    },
    [dispatch],
  )

  // ---- Keyboard shortcuts ------------------------------------------------
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      // Ignore if user is typing in an input
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return
      }

      const mod = e.metaKey || e.ctrlKey

      // Delete / Backspace → remove selected element
      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        selectedElement &&
        !selectedElement.locked
      ) {
        e.preventDefault()
        dispatch({ type: 'REMOVE_ELEMENT', id: selectedElement.id })
        return
      }

      // Ctrl/Cmd+Z → undo
      if (mod && !e.shiftKey && e.key === 'z') {
        e.preventDefault()
        undo()
        return
      }

      // Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y → redo
      if ((mod && e.shiftKey && e.key === 'z') || (mod && e.key === 'y')) {
        e.preventDefault()
        redo()
        return
      }

      // Arrow keys → nudge selected element 1%
      if (selectedElement && !selectedElement.locked) {
        const nudge: Record<string, { x?: number; y?: number }> = {
          ArrowUp: { y: -1 },
          ArrowDown: { y: 1 },
          ArrowLeft: { x: -1 },
          ArrowRight: { x: 1 },
        }
        const delta = nudge[e.key]
        if (delta) {
          e.preventDefault()
          const currentLayout = selectedElement[state.activeBreakpoint]
          dispatch({
            type: 'UPDATE_ELEMENT_LAYOUT',
            id: selectedElement.id,
            breakpoint: state.activeBreakpoint,
            layout: {
              x: currentLayout.x + (delta.x ?? 0),
              y: currentLayout.y + (delta.y ?? 0),
            },
          })
          return
        }
      }

      // Escape → deselect
      if (e.key === 'Escape') {
        dispatch({ type: 'SELECT_ELEMENT', id: null })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedElement, state.activeBreakpoint, dispatch, undo, redo])

  // ---- Render ------------------------------------------------------------
  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="flex h-screen flex-col overflow-hidden">
        {/* Toolbar */}
        <DesignerToolbar
          tenantSlug={tenantSlug}
          breakpoint={state.activeBreakpoint}
          canUndo={canUndo}
          canRedo={canRedo}
          zoom={state.zoom}
          showGrid={state.showGrid}
          isSaving={isSaving}
          hasUnsavedChanges={hasUnsavedChanges}
          onUndo={undo}
          onRedo={redo}
          onSetBreakpoint={(bp) =>
            dispatch({ type: 'SET_BREAKPOINT', breakpoint: bp })
          }
          onSetZoom={(zoom) => dispatch({ type: 'SET_ZOOM', zoom })}
          onToggleGrid={() => dispatch({ type: 'TOGGLE_GRID' })}
          onSave={handleSave}
          onReset={handleReset}
          onPreview={() => setShowPreview(!showPreview)}
          onOpenTemplates={() => setIsTemplatePickerOpen(true)}
        />

        {/* Main body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left column: Elements + Layers */}
          <div className="flex w-[280px] flex-col border-r bg-white">
            <div className="overflow-y-auto p-3">
              <ElementPanel
                onAddElement={(type) =>
                  dispatch({ type: 'ADD_ELEMENT', elementType: type })
                }
              />
            </div>
            <div className="border-t" />
            <div className="flex-1 overflow-y-auto p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Layers
              </p>
              <LayersPanel
                elements={state.design.elements}
                selectedElementId={state.selectedElementId}
                onSelectElement={(id) =>
                  dispatch({ type: 'SELECT_ELEMENT', id })
                }
                onToggleVisibility={(id) => {
                  const el = state.design.elements.find((e) => e.id === id)
                  if (el) {
                    dispatch({
                      type: 'UPDATE_ELEMENT_META',
                      id,
                      meta: { visible: !el.visible },
                    })
                  }
                }}
                onToggleLock={(id) => {
                  const el = state.design.elements.find((e) => e.id === id)
                  if (el) {
                    dispatch({
                      type: 'UPDATE_ELEMENT_META',
                      id,
                      meta: { locked: !el.locked },
                    })
                  }
                }}
                onReorderElements={(orderedIds) =>
                  dispatch({ type: 'REORDER_ELEMENTS', orderedIds })
                }
                onRemoveElement={(id) =>
                  dispatch({ type: 'REMOVE_ELEMENT', id })
                }
                onRenameElement={(id, label) =>
                  dispatch({ type: 'UPDATE_ELEMENT_META', id, meta: { label } })
                }
              />
            </div>
          </div>

          {/* Center: Canvas */}
          <div className="flex-1 overflow-hidden">
            <DesignerCanvas
              design={state.design}
              breakpoint={state.activeBreakpoint}
              selectedElementId={state.selectedElementId}
              zoom={state.zoom}
              showGrid={state.showGrid}
              onSelectElement={(id) =>
                dispatch({ type: 'SELECT_ELEMENT', id })
              }
              onUpdateElementLayout={(elementId, breakpoint, layout) =>
                dispatch({
                  type: 'UPDATE_ELEMENT_LAYOUT',
                  id: elementId,
                  breakpoint,
                  layout,
                })
              }
              onUpdateElementProps={(elementId, props) =>
                dispatch({
                  type: 'UPDATE_ELEMENT_PROPS',
                  id: elementId,
                  props,
                })
              }
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              onDropNewElement={(elementType, _x, _y) =>
                dispatch({ type: 'ADD_ELEMENT', elementType })
              }
            />
          </div>

          {/* Right column: Properties */}
          <PropertiesPanel
            selectedElement={selectedElement}
            breakpoint={state.activeBreakpoint}
            design={state.design}
            onUpdateLayout={(layout) => {
              if (!selectedElement) return
              dispatch({
                type: 'UPDATE_ELEMENT_LAYOUT',
                id: selectedElement.id,
                breakpoint: state.activeBreakpoint,
                layout,
              })
            }}
            onUpdateProps={(props) => {
              if (!selectedElement) return
              dispatch({
                type: 'UPDATE_ELEMENT_PROPS',
                id: selectedElement.id,
                props,
              })
            }}
            onUpdateAnimation={(animation) => {
              if (!selectedElement) return
              dispatch({
                type: 'UPDATE_ELEMENT_ANIMATION',
                id: selectedElement.id,
                animation,
              })
            }}
            onUpdateMeta={(meta) => {
              if (!selectedElement) return
              dispatch({
                type: 'UPDATE_ELEMENT_META',
                id: selectedElement.id,
                meta,
              })
            }}
            onUpdateCanvas={(updates) => {
              const canvasUpdates: Record<string, unknown> = {}
              if (updates.backgroundColor !== undefined) {
                canvasUpdates.backgroundColor = updates.backgroundColor
              }
              if (updates.backgroundImage !== undefined) {
                canvasUpdates.backgroundImage = updates.backgroundImage
              }
              if (updates.canvasHeight !== undefined) {
                const key =
                  updates.canvasHeight.breakpoint === 'desktop'
                    ? 'desktopHeight'
                    : 'mobileHeight'
                canvasUpdates[key] = updates.canvasHeight.height
              }
              dispatch({
                type: 'UPDATE_CANVAS',
                updates: canvasUpdates as Parameters<
                  typeof dispatch
                >[0] extends { type: 'UPDATE_CANVAS'; updates: infer U }
                  ? U
                  : never,
              })
            }}
          />
        </div>
      </div>

      {/* Template picker */}
      <TemplatePicker
        isOpen={isTemplatePickerOpen}
        onClose={() => setIsTemplatePickerOpen(false)}
        onSelectTemplate={handleSelectTemplate}
      />

      <PreviewModal
        design={state.design}
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
      />
    </DndContext>
  )
}

export default HeroDesigner
