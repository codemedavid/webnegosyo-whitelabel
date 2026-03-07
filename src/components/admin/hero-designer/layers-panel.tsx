'use client'

import { useId, useState, useRef } from 'react'
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
import type { HeroElement, HeroElementType } from '@/types/hero-designer'

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
}

// ── Props ───────────────────────────────────────────────────────────────────

interface LayersPanelProps {
  elements: HeroElement[]
  selectedElementId: string | null
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
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onRemove,
  onRename,
}: {
  element: HeroElement
  isSelected: boolean
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
          className="min-w-0 flex-1 truncate text-xs"
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
          title={element.visible ? 'Hide' : 'Show'}
        >
          {element.visible ? (
            <Eye className="h-3.5 w-3.5" />
          ) : (
            <EyeOff className="h-3.5 w-3.5" />
          )}
        </button>

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

export function LayersPanel({
  elements,
  selectedElementId,
  onSelectElement,
  onToggleVisibility,
  onToggleLock,
  onReorderElements,
  onRemoveElement,
  onRenameElement,
}: LayersPanelProps) {
  const dndId = useId()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

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
        <div className="space-y-0.5">
          {elements.map((element) => (
            <SortableLayerRow
              key={element.id}
              element={element}
              isSelected={element.id === selectedElementId}
              onSelect={() => onSelectElement(element.id)}
              onToggleVisibility={() => onToggleVisibility(element.id)}
              onToggleLock={() => onToggleLock(element.id)}
              onRemove={() => onRemoveElement(element.id)}
              onRename={(label) => onRenameElement(element.id, label)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
