'use client'

/**
 * Branding Studio "Menu Layout" surface panel.
 *
 * Custom (non-registry) panel that manages the tenant's menu categories in
 * place: drag to rearrange, pick grid vs horizontal scroll, and override the
 * card template per category. Edits live in a CategoryStudioDraft that streams
 * to the preview iframe (__categoryDraft) and publishes through the existing
 * category actions.
 */

import { useMemo } from 'react'
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
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { CARD_TEMPLATES } from '@/lib/card-templates'
import {
  applyCategoryDraft,
  type CategoryStudioDraft,
  type CategoryStudioOverride,
} from '@/lib/category-studio'
import type { Category } from '@/types/database'

const DISPLAY_LAYOUT_OPTIONS: Array<{ value: Category['display_layout']; label: string }> = [
  { value: 'grid', label: 'Grid' },
  { value: 'horizontal_scroll', label: 'Horizontal scroll' },
  { value: 'horizontal_mobile_only', label: 'Horizontal on mobile' },
  { value: 'horizontal_desktop_only', label: 'Horizontal on desktop' },
]

interface CategoryLayoutPanelProps {
  categories: Category[]
  draft: CategoryStudioDraft
  onDraftChange: (draft: CategoryStudioDraft) => void
}

interface SortableCategoryRowProps {
  category: Category
  override: CategoryStudioOverride | undefined
  onOverrideChange: (override: CategoryStudioOverride) => void
}

function SortableCategoryRow({ category, override, onOverrideChange }: SortableCategoryRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
  })

  const displayLayout = override?.display_layout ?? category.display_layout ?? 'grid'
  const cardTemplate =
    override?.card_template !== undefined
      ? override.card_template
      : (category.card_template ?? '')
  const isEdited =
    override !== undefined &&
    (override.display_layout !== undefined || override.card_template !== undefined)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-[10px] border bg-white px-2.5 py-2.5 ${
        isDragging ? 'z-10 border-[#1D1815] shadow-md' : 'border-[#E5E0D6]'
      }`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${category.name}`}
          className="cursor-grab touch-none rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="text-[14px]">{category.icon || '🍽️'}</span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold">{category.name}</span>
        {isEdited && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#E4572E]" />}
        {!category.is_active && (
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-500">
            Hidden
          </span>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 pl-7">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#8B857B]">
            Layout
          </span>
          <select
            value={displayLayout}
            onChange={(e) =>
              onOverrideChange({
                ...override,
                display_layout: e.target.value as Category['display_layout'],
              })
            }
            className="rounded-lg border border-[#E5E0D6] bg-white px-2 py-1.5 text-[12px] font-semibold outline-none focus:border-[#1D1815]"
          >
            {DISPLAY_LAYOUT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#8B857B]">
            Card template
          </span>
          <select
            value={cardTemplate}
            onChange={(e) => onOverrideChange({ ...override, card_template: e.target.value })}
            className="rounded-lg border border-[#E5E0D6] bg-white px-2 py-1.5 text-[12px] font-semibold outline-none focus:border-[#1D1815]"
          >
            <option value="">Inherit store template</option>
            {CARD_TEMPLATES.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  )
}

export function CategoryLayoutPanel({ categories, draft, onDraftChange }: CategoryLayoutPanelProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  // The list as the draft arranges it — identical to what the preview shows.
  const arranged = useMemo(() => applyCategoryDraft(categories, draft), [categories, draft])
  const arrangedIds = useMemo(() => arranged.map((c) => c.id), [arranged])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = arrangedIds.indexOf(String(active.id))
    const newIndex = arrangedIds.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    onDraftChange({ ...draft, order: arrayMove(arrangedIds, oldIndex, newIndex) })
  }

  const handleOverrideChange = (categoryId: string, override: CategoryStudioOverride) => {
    onDraftChange({ ...draft, overrides: { ...draft.overrides, [categoryId]: override } })
  }

  if (categories.length === 0) {
    return (
      <div className="px-[18px] py-6 text-[12px] leading-relaxed text-[#8B857B]">
        No categories yet — add some under Admin → Categories, then arrange them here.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 px-[18px] pb-4 pt-3.5">
      <div className="text-[11px] font-extrabold uppercase tracking-widest text-[#8B857B]">
        Categories — drag to arrange
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={arrangedIds} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {arranged.map((category) => (
              <SortableCategoryRow
                key={category.id}
                category={category}
                override={draft.overrides?.[category.id]}
                onOverrideChange={(override) => handleOverrideChange(category.id, override)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <p className="mt-1 text-[11px] leading-relaxed text-[#8B857B]">
        The preview rearranges instantly — nothing is saved until you publish.
      </p>
    </div>
  )
}
