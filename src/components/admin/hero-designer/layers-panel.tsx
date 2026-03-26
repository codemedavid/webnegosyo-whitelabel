'use client'

import { useCallback, useEffect, useId, useState, useRef } from 'react'
import {
  GripVertical,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  Type,
  ImageIcon,
  MousePointer2,
  Square,
  Minus,
  Star,
  Play,
  Timer,
  Award,
  Palette,
  Rows3,
  Columns3,
  ChevronDown,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react'
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
  arrayMove,
} from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import type { Breakpoint, HeroElement, HeroElementType } from '@/types/hero-designer'

// ── Icon map ────────────────────────────────────────────────────────────────

const ICON_MAP: Record<HeroElementType, LucideIcon> = {
  text: Type,
  image: ImageIcon,
  button: MousePointer2,
  shape: Square,
  divider: Minus,
  icon: Star,
  video: Play,
  countdown: Timer,
  'social-proof': Award,
  'animated-bg': Palette,
  row: Rows3,
  column: Columns3,
}

// ── Props ───────────────────────────────────────────────────────────────────

interface LayersPanelProps {
  elements: HeroElement[]
  selectedElementId: string | null
  activeBreakpoint: Breakpoint
  onSelectElement: (id: string | null) => void
  onToggleVisibility: (id: string) => void
  onToggleLock: (id: string) => void
  onReorderElements: (elementIds: string[]) => void
  onRemoveElement: (id: string) => void
  onRenameElement: (id: string, label: string) => void
}

// ── Sortable layer row ──────────────────────────────────────────────────────

function SortableLayerRow({
  element,
  isSelected,
  activeBreakpoint,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onRemove,
  onRename,
}: {
  element: HeroElement
  isSelected: boolean
  activeBreakpoint: Breakpoint
  onSelect: () => void
  onToggleVisibility: () => void
  onToggleLock: () => void
  onRemove: () => void
  onRename: (label: string) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(element.label)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: element.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  const isVisibleOnBreakpoint = element.visibility?.[activeBreakpoint] ?? element.visible !== false

  const Icon = ICON_MAP[element.type]

  const handleDoubleClick = () => {
    setEditValue(element.label)
    setIsEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const commitRename = () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== element.label) {
      onRename(trimmed)
    }
    setIsEditing(false)
  }

  const handleDeleteClick = () => {
    if (confirmDelete) {
      onRemove()
      setConfirmDelete(false)
    } else {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 2000)
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`group flex items-center gap-1 rounded-md border px-1.5 py-1 text-sm transition-colors ${
        !isVisibleOnBreakpoint ? 'opacity-50' : ''
      } ${
        isSelected
          ? 'border-blue-200 bg-blue-50'
          : 'border-transparent hover:bg-accent'
      }`}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="cursor-grab p-0.5 text-muted-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      {/* Type icon */}
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />

      {/* Label */}
      {isEditing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') setIsEditing(false)
          }}
          onClick={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 rounded border border-input bg-background px-1 py-0 text-xs outline-none focus:ring-1 focus:ring-ring"
        />
      ) : (
        <span
          onDoubleClick={handleDoubleClick}
          className={`min-w-0 flex-1 truncate text-xs ${!isVisibleOnBreakpoint ? 'line-through text-muted-foreground' : ''}`}
        >
          {element.label}
        </span>
      )}

      {/* Action buttons */}
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleVisibility()
          }}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
          title={isVisibleOnBreakpoint ? 'Hide' : 'Show'}
        >
          {isVisibleOnBreakpoint ? (
            <Eye className="h-3.5 w-3.5" />
          ) : (
            <EyeOff className="h-3.5 w-3.5" />
          )}
        </button>

        {/* Breakpoint visibility dots — only show when visibility differs */}
        {element.visibility && !(element.visibility.desktop === element.visibility.tablet && element.visibility.tablet === element.visibility.mobile) && (
          <div className="flex items-center gap-0.5 ml-0.5" title={`D:${element.visibility?.desktop ? '✓' : '✗'} T:${element.visibility?.tablet ? '✓' : '✗'} M:${element.visibility?.mobile ? '✓' : '✗'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${element.visibility?.desktop ? 'bg-green-400' : 'bg-zinc-600'}`} />
            <span className={`h-1.5 w-1.5 rounded-full ${element.visibility?.tablet ? 'bg-green-400' : 'bg-zinc-600'}`} />
            <span className={`h-1.5 w-1.5 rounded-full ${element.visibility?.mobile ? 'bg-green-400' : 'bg-zinc-600'}`} />
          </div>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleLock()
          }}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
          title={element.locked ? 'Unlock' : 'Lock'}
        >
          {element.locked ? (
            <Lock className="h-3.5 w-3.5" />
          ) : (
            <Unlock className="h-3.5 w-3.5" />
          )}
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            handleDeleteClick()
          }}
          className={`rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 ${
            confirmDelete
              ? 'text-destructive opacity-100'
              : 'text-muted-foreground hover:text-destructive'
          }`}
          title={confirmDelete ? 'Click again to confirm' : 'Delete'}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

function LayerTree({
  elements,
  allElements,
  selectedElementId,
  activeBreakpoint,
  depth,
  expandedIds,
  onToggleExpand,
  onSelectElement,
  onToggleVisibility,
  onToggleLock,
  onRemoveElement,
  onRenameElement,
}: {
  elements: HeroElement[]
  allElements: HeroElement[]
  selectedElementId: string | null
  activeBreakpoint: Breakpoint
  depth: number
  expandedIds: Set<string>
  onToggleExpand: (id: string) => void
  onSelectElement: (id: string | null) => void
  onToggleVisibility: (id: string) => void
  onToggleLock: (id: string) => void
  onRemoveElement: (id: string) => void
  onRenameElement: (id: string, label: string) => void
}) {
  return (
    <div className="space-y-0.5">
      {elements.map((element) => {
        const children = allElements.filter((el) => el.parentId === element.id)
        const hasChildren = children.length > 0
        const isExpanded = expandedIds.has(element.id)

        return (
          <div key={element.id}>
            <div style={{ paddingLeft: depth * 16 }} className="flex items-center">
              {hasChildren && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleExpand(element.id)
                  }}
                  className="mr-0.5 rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </button>
              )}
              {!hasChildren && <span className="mr-0.5 w-4" />}
              <div className="min-w-0 flex-1">
                <SortableLayerRow
                  element={element}
                  isSelected={element.id === selectedElementId}
                  activeBreakpoint={activeBreakpoint}
                  onSelect={() => onSelectElement(element.id)}
                  onToggleVisibility={() => onToggleVisibility(element.id)}
                  onToggleLock={() => onToggleLock(element.id)}
                  onRemove={() => onRemoveElement(element.id)}
                  onRename={(label) => onRenameElement(element.id, label)}
                />
              </div>
            </div>
            {hasChildren && isExpanded && (
              <LayerTree
                elements={children}
                allElements={allElements}
                selectedElementId={selectedElementId}
                activeBreakpoint={activeBreakpoint}
                depth={depth + 1}
                expandedIds={expandedIds}
                onToggleExpand={onToggleExpand}
                onSelectElement={onSelectElement}
                onToggleVisibility={onToggleVisibility}
                onToggleLock={onToggleLock}
                onRemoveElement={onRemoveElement}
                onRenameElement={onRenameElement}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

export function LayersPanel({
  elements,
  selectedElementId,
  activeBreakpoint,
  onSelectElement,
  onToggleVisibility,
  onToggleLock,
  onReorderElements,
  onRemoveElement,
  onRenameElement,
}: LayersPanelProps) {
  const dndId = useId()
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Auto-expand containers on mount
  useEffect(() => {
    const containerIds = elements
      .filter((el) => el.type === 'row' || el.type === 'column')
      .map((el) => el.id)
    if (containerIds.length > 0) {
      setExpandedIds((prev) => {
        const next = new Set(prev)
        containerIds.forEach((id) => next.add(id))
        return next
      })
    }
  }, [elements])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  // Root elements (no parentId)
  const rootElements = elements.filter((el) => !el.parentId)

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = elements.findIndex((el) => el.id === active.id)
    const newIndex = elements.findIndex((el) => el.id === over.id)
    const reordered = arrayMove(elements, oldIndex, newIndex)
    onReorderElements(reordered.map((el) => el.id))
  }

  if (elements.length === 0) {
    return (
      <div className="py-6 text-center text-xs text-muted-foreground">
        No elements yet. Add one from above.
      </div>
    )
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToVerticalAxis]}
    >
      <SortableContext
        items={elements.map((el) => el.id)}
        strategy={verticalListSortingStrategy}
      >
        <LayerTree
          elements={rootElements}
          allElements={elements}
          selectedElementId={selectedElementId}
          activeBreakpoint={activeBreakpoint}
          depth={0}
          expandedIds={expandedIds}
          onToggleExpand={toggleExpand}
          onSelectElement={onSelectElement}
          onToggleVisibility={onToggleVisibility}
          onToggleLock={onToggleLock}
          onRemoveElement={onRemoveElement}
          onRenameElement={onRenameElement}
        />
      </SortableContext>
    </DndContext>
  )
}
