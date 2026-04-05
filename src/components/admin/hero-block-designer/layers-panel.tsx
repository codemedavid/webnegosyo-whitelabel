'use client'

import { useCallback, useEffect, useState } from 'react'
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

// ── Main component ──────────────────────────────────────────────────────────

export function BlockLayersPanel({
  design,
  selection,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  breakpoint,
  dispatch,
}: BlockLayersPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())

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

  if (design.sections.length === 0) {
    return (
      <div className="py-6 text-center text-xs text-muted-foreground">
        No sections yet. Add one from the Add tab.
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      {design.sections.map((section) => {
        const isExpanded = expandedSections.has(section.id)
        const sectionSelected = isSectionSelected(section.id)

        return (
          <div key={section.id}>
            {/* Section row */}
            <div
              onClick={() =>
                selectBlock({ type: 'section', sectionId: section.id })
              }
              className={`group flex cursor-pointer items-center gap-1 rounded-md border px-1.5 py-1 text-sm transition-colors ${
                sectionSelected
                  ? 'border-blue-200 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/30'
                  : 'border-transparent hover:bg-accent'
              }`}
            >
              {/* Grip handle (for future drag) */}
              <span className="p-0.5 text-muted-foreground">
                <GripVertical className="h-3.5 w-3.5" />
              </span>

              {/* Expand/collapse chevron */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  toggleSection(section.id)
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
                {section.label}
              </span>

              {/* Section info */}
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {section.columns.length} col{section.columns.length !== 1 ? 's' : ''}
              </span>

              {/* Delete */}
              <DeleteButton
                onConfirm={() =>
                  dispatch({ type: 'REMOVE_SECTION', sectionId: section.id })
                }
              />
            </div>

            {/* Columns + widgets */}
            {isExpanded && (
              <div className="ml-4 space-y-0.5">
                {section.columns.map((column) => {
                  const columnSelected = isColumnSelected(section.id, column.id)

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

                      {/* Widget rows */}
                      {column.widgets.length > 0 && (
                        <div className="ml-5 space-y-0.5">
                          {column.widgets.map((widget) => {
                            const widgetSelected = isWidgetSelected(
                              section.id,
                              column.id,
                              widget.id,
                            )
                            const WidgetIcon = WIDGET_ICON_MAP[widget.type]

                            return (
                              <div
                                key={widget.id}
                                onClick={() =>
                                  selectBlock({
                                    type: 'widget',
                                    sectionId: section.id,
                                    columnId: column.id,
                                    widgetId: widget.id,
                                  })
                                }
                                className={`group flex cursor-pointer items-center gap-1 rounded-md border px-1.5 py-1 text-sm transition-colors ${
                                  widgetSelected
                                    ? 'border-blue-200 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/30'
                                    : 'border-transparent hover:bg-accent'
                                }`}
                              >
                                <WidgetIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                <span className="min-w-0 flex-1 truncate text-xs">
                                  {widget.label}
                                </span>

                                {/* Delete widget */}
                                <DeleteButton
                                  onConfirm={() =>
                                    dispatch({
                                      type: 'REMOVE_WIDGET',
                                      sectionId: section.id,
                                      columnId: column.id,
                                      widgetId: widget.id,
                                    })
                                  }
                                />
                              </div>
                            )
                          })}
                        </div>
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
  )
}
