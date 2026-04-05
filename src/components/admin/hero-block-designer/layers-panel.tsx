'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Trash2,
  Type,
  ImageIcon,
  MousePointer2,
  Square,
  Minus,
  MoveVertical,
  Star,
  Play,
  Timer,
  Award,
  Palette,
  Layers,
  Columns3,
  type LucideIcon,
} from 'lucide-react'

import type { BlockDesignerAction } from '@/hooks/use-hero-block-designer'
import type {
  BlockSelection,
  BlockWidget,
  BlockWidgetType,
  Breakpoint,
  HeroBlockDesign,
} from '@/types/hero-block-designer'

// ── Icon map ────────────────────────────────────────────────────────────────

const WIDGET_ICON_MAP: Record<BlockWidgetType, LucideIcon> = {
  text: Type,
  image: ImageIcon,
  button: MousePointer2,
  shape: Square,
  divider: Minus,
  spacer: MoveVertical,
  icon: Star,
  video: Play,
  countdown: Timer,
  'social-proof': Award,
  'animated-bg': Palette,
}

// ── Props ───────────────────────────────────────────────────────────────────

interface BlockLayersPanelProps {
  design: HeroBlockDesign
  selection: BlockSelection | null
  breakpoint: Breakpoint
  dispatch: React.Dispatch<BlockDesignerAction>
}

// ── Delete button with confirmation ─────────────────────────────────────────

function DeleteButton({ onConfirm }: { onConfirm: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirmDelete) {
      onConfirm()
      setConfirmDelete(false)
    } else {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 2000)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 ${
        confirmDelete
          ? 'text-destructive opacity-100'
          : 'text-muted-foreground hover:text-destructive'
      }`}
      title={confirmDelete ? 'Click again to confirm' : 'Delete'}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )
}

// ── Sortable section row ────────────────────────────────────────────────────

interface SortableSectionRowProps {
  sectionId: string
  label: string
  columnCount: number
  isExpanded: boolean
  isSelected: boolean
  onSelect: () => void
  onToggle: () => void
  onDelete: () => void
}

function SortableSectionRow({
  sectionId,
  label,
  columnCount,
  isExpanded,
  isSelected,
  onSelect,
  onToggle,
  onDelete,
}: SortableSectionRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sectionId,
    data: { type: 'section', sectionId },
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as const,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`group flex cursor-pointer items-center gap-1 rounded-md border px-1.5 py-1 text-sm transition-colors ${
        isSelected
          ? 'border-blue-200 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/30'
          : 'border-transparent hover:bg-accent'
      }`}
    >
      {/* Drag handle */}
      <span
        className="cursor-grab p-0.5 text-muted-foreground active:cursor-grabbing"
        {...listeners}
        {...attributes}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </span>

      {/* Expand/collapse chevron */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        className="rounded p-0.5 text-muted-foreground hover:text-foreground"
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
      </button>

      {/* Section icon + label */}
      <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-xs font-medium">
        {label}
      </span>

      {/* Section info */}
      <span className="shrink-0 text-[10px] text-muted-foreground">
        {columnCount} col{columnCount !== 1 ? 's' : ''}
      </span>

      {/* Delete */}
      <DeleteButton onConfirm={onDelete} />
    </div>
  )
}

// ── Sortable widget row ─────────────────────────────────────────────────────

interface SortableWidgetRowProps {
  widget: BlockWidget
  sectionId: string
  columnId: string
  isSelected: boolean
  onSelect: () => void
  onDelete: () => void
}

function SortableWidgetRow({
  widget,
  sectionId,
  columnId,
  isSelected,
  onSelect,
  onDelete,
}: SortableWidgetRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `layer-widget-${widget.id}`,
    data: { type: 'widget', sectionId, columnId, widgetId: widget.id },
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as const,
    zIndex: isDragging ? 50 : undefined,
  }

  const WidgetIcon = WIDGET_ICON_MAP[widget.type]

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`group flex cursor-pointer items-center gap-1 rounded-md border px-1.5 py-1 text-sm transition-colors ${
        isSelected
          ? 'border-blue-200 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/30'
          : 'border-transparent hover:bg-accent'
      }`}
    >
      {/* Drag handle */}
      <span
        className="cursor-grab p-0.5 text-muted-foreground active:cursor-grabbing"
        {...listeners}
        {...attributes}
      >
        <GripVertical className="h-3 w-3" />
      </span>

      <WidgetIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-xs">
        {widget.label}
      </span>

      {/* Delete widget */}
      <DeleteButton onConfirm={onDelete} />
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export function BlockLayersPanel({
  design,
  selection,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  breakpoint,
  dispatch,
}: BlockLayersPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  )

  // Auto-expand all sections on mount and when sections change
  useEffect(() => {
    const sectionIds = design.sections.map((s) => s.id)
    if (sectionIds.length > 0) {
      setExpandedSections((prev) => {
        const next = new Set(prev)
        sectionIds.forEach((id) => next.add(id))
        return next
      })
    }
  }, [design.sections])

  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
      }
      return next
    })
  }, [])

  const selectBlock = useCallback(
    (sel: BlockSelection | null) => {
      dispatch({ type: 'SELECT_BLOCK', selection: sel })
    },
    [dispatch],
  )

  const isSectionSelected = (sectionId: string) =>
    selection?.type === 'section' && selection.sectionId === sectionId

  const isColumnSelected = (sectionId: string, columnId: string) =>
    selection?.type === 'column' &&
    selection.sectionId === sectionId &&
    selection.columnId === columnId

  const isWidgetSelected = (sectionId: string, columnId: string, widgetId: string) =>
    selection?.type === 'widget' &&
    selection.sectionId === sectionId &&
    selection.columnId === columnId &&
    selection.widgetId === widgetId

  // --- Section drag end ---
  const handleSectionDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const sectionIds = design.sections.map((s) => s.id)
      const oldIndex = sectionIds.indexOf(active.id as string)
      const newIndex = sectionIds.indexOf(over.id as string)
      if (oldIndex === -1 || newIndex === -1) return

      const reordered = [...sectionIds]
      reordered.splice(oldIndex, 1)
      reordered.splice(newIndex, 0, active.id as string)
      dispatch({ type: 'REORDER_SECTIONS', sectionIds: reordered })
    },
    [design.sections, dispatch],
  )

  // --- Widget drag end (within a column) ---
  const handleWidgetDragEnd = useCallback(
    (sectionId: string, columnId: string) => (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const section = design.sections.find((s) => s.id === sectionId)
      const column = section?.columns.find((c) => c.id === columnId)
      if (!column) return

      // Strip the `layer-widget-` prefix to get the actual widget IDs
      const activeWidgetId = (active.id as string).replace('layer-widget-', '')
      const overWidgetId = (over.id as string).replace('layer-widget-', '')

      const widgetIds = column.widgets.map((w) => w.id)
      const oldIndex = widgetIds.indexOf(activeWidgetId)
      const newIndex = widgetIds.indexOf(overWidgetId)
      if (oldIndex === -1 || newIndex === -1) return

      const reordered = [...widgetIds]
      reordered.splice(oldIndex, 1)
      reordered.splice(newIndex, 0, activeWidgetId)
      dispatch({
        type: 'REORDER_WIDGETS',
        sectionId,
        columnId,
        widgetIds: reordered,
      })
    },
    [design.sections, dispatch],
  )

  if (design.sections.length === 0) {
    return (
      <div className="py-6 text-center text-xs text-muted-foreground">
        No sections yet. Add one from the Add tab.
      </div>
    )
  }

  const sectionIds = design.sections.map((s) => s.id)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={handleSectionDragEnd}
    >
      <SortableContext
        items={sectionIds}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-0.5">
          {design.sections.map((section) => {
            const isExpanded = expandedSections.has(section.id)
            const sectionSelected = isSectionSelected(section.id)

            return (
              <div key={section.id}>
                {/* Sortable section row */}
                <SortableSectionRow
                  sectionId={section.id}
                  label={section.label}
                  columnCount={section.columns.length}
                  isExpanded={isExpanded}
                  isSelected={sectionSelected}
                  onSelect={() =>
                    selectBlock({ type: 'section', sectionId: section.id })
                  }
                  onToggle={() => toggleSection(section.id)}
                  onDelete={() =>
                    dispatch({ type: 'REMOVE_SECTION', sectionId: section.id })
                  }
                />

                {/* Columns + widgets */}
                {isExpanded && (
                  <div className="ml-4 space-y-0.5">
                    {section.columns.map((column) => {
                      const columnSelected = isColumnSelected(section.id, column.id)
                      const widgetSortableIds = column.widgets.map(
                        (w) => `layer-widget-${w.id}`,
                      )

                      return (
                        <div key={column.id}>
                          {/* Column row */}
                          <div
                            onClick={() =>
                              selectBlock({
                                type: 'column',
                                sectionId: section.id,
                                columnId: column.id,
                              })
                            }
                            className={`flex cursor-pointer items-center gap-1 rounded-md border px-1.5 py-1 text-sm transition-colors ${
                              columnSelected
                                ? 'border-blue-200 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/30'
                                : 'border-transparent hover:bg-accent'
                            }`}
                          >
                            <Columns3 className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate text-xs">
                              Column ({column.width}%)
                            </span>
                          </div>

                          {/* Sortable widget rows */}
                          {column.widgets.length > 0 && (
                            <DndContext
                              sensors={sensors}
                              collisionDetection={closestCenter}
                              modifiers={[restrictToVerticalAxis]}
                              onDragEnd={handleWidgetDragEnd(
                                section.id,
                                column.id,
                              )}
                            >
                              <SortableContext
                                items={widgetSortableIds}
                                strategy={verticalListSortingStrategy}
                              >
                                <div className="ml-5 space-y-0.5">
                                  {column.widgets.map((widget) => (
                                    <SortableWidgetRow
                                      key={widget.id}
                                      widget={widget}
                                      sectionId={section.id}
                                      columnId={column.id}
                                      isSelected={isWidgetSelected(
                                        section.id,
                                        column.id,
                                        widget.id,
                                      )}
                                      onSelect={() =>
                                        selectBlock({
                                          type: 'widget',
                                          sectionId: section.id,
                                          columnId: column.id,
                                          widgetId: widget.id,
                                        })
                                      }
                                      onDelete={() =>
                                        dispatch({
                                          type: 'REMOVE_WIDGET',
                                          sectionId: section.id,
                                          columnId: column.id,
                                          widgetId: widget.id,
                                        })
                                      }
                                    />
                                  ))}
                                </div>
                              </SortableContext>
                            </DndContext>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </SortableContext>
    </DndContext>
  )
}
