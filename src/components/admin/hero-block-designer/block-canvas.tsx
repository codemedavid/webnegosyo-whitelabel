'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import type {
  HeroBlockDesign,
  Breakpoint,
  BlockSelection,
} from '@/types/hero-block-designer'
import type { BlockDesignerAction } from '@/hooks/use-hero-block-designer'
import { BlockCanvasSection } from './block-canvas-section'
import { InsertionPoint } from './insertion-point'

// ---------------------------------------------------------------------------
// Breakpoint width mapping
// ---------------------------------------------------------------------------

const BREAKPOINT_WIDTHS: Record<Breakpoint, number> = {
  desktop: 1440,
  tablet: 768,
  mobile: 390,
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BlockCanvasProps {
  design: HeroBlockDesign
  breakpoint: Breakpoint
  selection: BlockSelection | null
  dispatch: React.Dispatch<BlockDesignerAction>
}

// ---------------------------------------------------------------------------
// Helper: find which section/column owns a widget
// ---------------------------------------------------------------------------

function findWidgetLocation(
  design: HeroBlockDesign,
  widgetId: string,
): { sectionId: string; columnId: string } | null {
  for (const section of design.sections) {
    for (const column of section.columns) {
      for (const widget of column.widgets) {
        if (widget.id === widgetId) {
          return { sectionId: section.id, columnId: column.id }
        }
      }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// BlockCanvas
// ---------------------------------------------------------------------------

export function BlockCanvas({
  design,
  breakpoint,
  selection,
  dispatch,
}: BlockCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  // DnD sensors — 8px activation distance so clicks still work
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  )

  // Measure container with ResizeObserver
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Canvas dimensions
  const canvasWidth = BREAKPOINT_WIDTHS[breakpoint]
  const scaleFactor =
    containerWidth > 0
      ? Math.min((containerWidth - 64) / canvasWidth, 1)
      : 1

  // --- Selection handlers ---

  const handleSelectSection = useCallback(
    (sectionId: string) => {
      dispatch({ type: 'SELECT_BLOCK', selection: { type: 'section', sectionId } })
    },
    [dispatch],
  )

  const handleSelectColumn = useCallback(
    (sectionId: string, columnId: string) => {
      dispatch({
        type: 'SELECT_BLOCK',
        selection: { type: 'column', sectionId, columnId },
      })
    },
    [dispatch],
  )

  const handleSelectWidget = useCallback(
    (widgetId: string) => {
      const location = findWidgetLocation(design, widgetId)
      if (!location) return
      dispatch({
        type: 'SELECT_BLOCK',
        selection: {
          type: 'widget',
          sectionId: location.sectionId,
          columnId: location.columnId,
          widgetId,
        },
      })
    },
    [design, dispatch],
  )

  const handleAddWidget = useCallback(
    (sectionId: string, columnId: string, atIndex?: number) => {
      dispatch({
        type: 'ADD_WIDGET',
        sectionId,
        columnId,
        widgetType: 'text',
        atIndex,
      })
    },
    [dispatch],
  )

  const handleAddSection = useCallback(
    (afterIndex: number) => {
      dispatch({
        type: 'ADD_SECTION',
        columnWidths: [100],
        afterIndex,
      })
    },
    [dispatch],
  )

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        dispatch({ type: 'SELECT_BLOCK', selection: null })
      }
    },
    [dispatch],
  )

  // --- DnD handlers ---

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string)
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragId(null)

      const { active, over } = event
      if (!over || active.id === over.id) return

      const activeData = active.data.current as
        | { type: 'section'; sectionId: string }
        | { type: 'widget'; sectionId: string; columnId: string; widgetId: string }
        | undefined
      const overData = over.data.current as
        | { type: 'section'; sectionId: string }
        | { type: 'widget'; sectionId: string; columnId: string; widgetId: string }
        | { type: 'column-droppable'; sectionId: string; columnId: string }
        | undefined

      if (!activeData) return

      // --- Section reorder ---
      if (activeData.type === 'section') {
        const sectionIds = design.sections.map((s) => s.id)
        const oldIndex = sectionIds.indexOf(activeData.sectionId)
        const overSectionId =
          overData?.type === 'section'
            ? (overData as { sectionId: string }).sectionId
            : (over.id as string)
        const newIndex = sectionIds.indexOf(overSectionId)
        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return

        const reordered = [...sectionIds]
        reordered.splice(oldIndex, 1)
        reordered.splice(newIndex, 0, activeData.sectionId)
        dispatch({ type: 'REORDER_SECTIONS', sectionIds: reordered })
        return
      }

      // --- Widget reorder / move ---
      if (activeData.type === 'widget') {
        // Determine target column info
        let targetSectionId: string | undefined
        let targetColumnId: string | undefined
        let targetWidgetId: string | undefined

        if (overData?.type === 'widget') {
          targetSectionId = overData.sectionId
          targetColumnId = overData.columnId
          targetWidgetId = overData.widgetId
        } else if (overData?.type === 'column-droppable') {
          targetSectionId = overData.sectionId
          targetColumnId = overData.columnId
        }

        if (!targetSectionId || !targetColumnId) return

        const sameColumn =
          activeData.sectionId === targetSectionId &&
          activeData.columnId === targetColumnId

        if (sameColumn) {
          // Reorder within column
          const section = design.sections.find((s) => s.id === targetSectionId)
          const column = section?.columns.find((c) => c.id === targetColumnId)
          if (!column) return

          const widgetIds = column.widgets.map((w) => w.id)
          const oldIndex = widgetIds.indexOf(activeData.widgetId)
          const newIndex = targetWidgetId
            ? widgetIds.indexOf(targetWidgetId)
            : widgetIds.length
          if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return

          const reordered = [...widgetIds]
          reordered.splice(oldIndex, 1)
          reordered.splice(newIndex, 0, activeData.widgetId)
          dispatch({
            type: 'REORDER_WIDGETS',
            sectionId: targetSectionId,
            columnId: targetColumnId,
            widgetIds: reordered,
          })
        } else {
          // Move to different column
          const targetSection = design.sections.find(
            (s) => s.id === targetSectionId,
          )
          const targetColumn = targetSection?.columns.find(
            (c) => c.id === targetColumnId,
          )
          const toIndex = targetWidgetId && targetColumn
            ? targetColumn.widgets.findIndex((w) => w.id === targetWidgetId)
            : (targetColumn?.widgets.length ?? 0)

          dispatch({
            type: 'MOVE_WIDGET',
            fromSectionId: activeData.sectionId,
            fromColumnId: activeData.columnId,
            widgetId: activeData.widgetId,
            toSectionId: targetSectionId,
            toColumnId: targetColumnId,
            toIndex: toIndex === -1 ? 0 : toIndex,
          })
        }
      }
    },
    [design, dispatch],
  )

  const hasSections = design.sections.length > 0
  const sectionIds = design.sections.map((s) => s.id)

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full items-start justify-center overflow-auto bg-muted/30 p-8"
      onClick={handleCanvasClick}
    >
      <div
        className="shrink-0 shadow-lg"
        style={{
          width: canvasWidth,
          transform: `scale(${scaleFactor})`,
          transformOrigin: 'top center',
          backgroundColor: design.globalStyles.backgroundColor,
          backgroundImage: design.globalStyles.backgroundImage
            ? `url(${design.globalStyles.backgroundImage})`
            : undefined,
          backgroundSize: design.globalStyles.backgroundImage
            ? 'cover'
            : undefined,
          backgroundPosition: design.globalStyles.backgroundImage
            ? 'center'
            : undefined,
        }}
        onClick={handleCanvasClick}
      >
        {hasSections ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={activeDragId && sectionIds.includes(activeDragId) ? [restrictToVerticalAxis] : undefined}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            {/* Insertion point before first section */}
            <InsertionPoint
              onClick={() => handleAddSection(-1)}
              label="Add section"
            />

            <SortableContext
              items={sectionIds}
              strategy={verticalListSortingStrategy}
            >
              {design.sections.map((section, index) => (
                <div key={section.id}>
                  <BlockCanvasSection
                    section={section}
                    isSelected={
                      selection?.type === 'section' &&
                      selection.sectionId === section.id
                    }
                    selectedColumnId={
                      selection?.sectionId === section.id
                        ? selection?.columnId ?? null
                        : null
                    }
                    selectedWidgetId={
                      selection?.sectionId === section.id
                        ? selection?.widgetId ?? null
                        : null
                    }
                    breakpoint={breakpoint}
                    onSelectSection={() => handleSelectSection(section.id)}
                    onSelectColumn={(columnId) =>
                      handleSelectColumn(section.id, columnId)
                    }
                    onSelectWidget={handleSelectWidget}
                    onAddWidget={handleAddWidget}
                  />

                  {/* Insertion point after each section */}
                  <InsertionPoint
                    onClick={() => handleAddSection(index)}
                    label="Add section"
                  />
                </div>
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          /* Empty state */
          <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 text-muted-foreground">
            <p className="text-sm">No sections yet</p>
            <InsertionPoint
              onClick={() => handleAddSection(-1)}
              label="Add First Section"
            />
          </div>
        )}
      </div>
    </div>
  )
}
