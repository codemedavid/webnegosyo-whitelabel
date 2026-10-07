'use client'

/**
 * Menu management's "Arrange" mode: put each category's dishes in the order
 * customers see them online AND cashiers see them on the POS — both sort by
 * the same `menu_items.order`.
 *
 * Every move saves at once (no separate save step to forget). The moved order
 * shows immediately and snaps back with an error if the write is refused.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { cn } from '@/lib/utils'
import { formatPrice } from '@/lib/cart-utils'
import { reorderMenuItemsAction } from '@/app/actions/menu-items'
import { describeActionError } from '@/components/admin/server-action-safety'
import type { MenuItemGroup } from '@/lib/menu-list-groups'
import type { AdminMenuListItem } from '@/lib/queries/admin-menu-list'

/** Pointer travel before a press becomes a drag, so taps on the arrows stay taps. */
const DRAG_ACTIVATION_DISTANCE_PX = 8

interface MenuArrangeListProps {
  /** Real categories only — dishes whose category is gone cannot be arranged. */
  groups: readonly MenuItemGroup<AdminMenuListItem>[]
  tenantId: string
  tenantSlug: string
}

export function MenuArrangeList({ groups, tenantId, tenantSlug }: MenuArrangeListProps) {
  const router = useRouter()
  /**
   * Arrangements the merchant made that the server has not echoed back yet,
   * per category. Dropped whenever fresh groups arrive — that is the refresh
   * landing with the saved order — except the one still saving: a refresh
   * from an earlier save would otherwise snap it back mid-write.
   */
  const [pending, setPending] = useState<Record<string, string[]>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [groupsSeen, setGroupsSeen] = useState(groups)
  if (groupsSeen !== groups) {
    setGroupsSeen(groups)
    setPending((prev) => (savingKey && prev[savingKey] ? { [savingKey]: prev[savingKey] } : {}))
  }

  const handleArrange = async (categoryId: string, previous: string[], next: string[]) => {
    setSavingKey(categoryId)
    setPending((prev) => ({ ...prev, [categoryId]: next }))
    const revert = () => setPending((prev) => ({ ...prev, [categoryId]: previous }))
    try {
      const result = await reorderMenuItemsAction(tenantId, tenantSlug, categoryId, next)
      if (result.success) {
        router.refresh()
      } else {
        revert()
        toast.error(result.error || 'Could not save the new order. Please try again.')
      }
    } catch (error) {
      revert()
      toast.error(describeActionError(error))
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <ArrangeCategory
          key={group.key}
          group={group}
          orderedIds={pending[group.key] ?? group.items.map((item) => item.id)}
          isSaving={savingKey === group.key}
          isLocked={savingKey !== null && savingKey !== group.key}
          onArrange={(previous, next) => void handleArrange(group.key, previous, next)}
        />
      ))}
    </div>
  )
}

interface ArrangeCategoryProps {
  group: MenuItemGroup<AdminMenuListItem>
  orderedIds: string[]
  isSaving: boolean
  /** Another category is mid-save; one write at a time keeps the order honest. */
  isLocked: boolean
  onArrange: (previous: string[], next: string[]) => void
}

function ArrangeCategory({ group, orderedIds, isSaving, isLocked, onArrange }: ArrangeCategoryProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE_PX } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const itemsById = new Map(group.items.map((item) => [item.id, item]))
  const items = orderedIds.map((id) => itemsById.get(id)).filter((item): item is AdminMenuListItem => Boolean(item))
  const isDisabled = isSaving || isLocked

  const move = (fromIndex: number, toIndex: number) => {
    if (isDisabled || toIndex < 0 || toIndex >= orderedIds.length || fromIndex === toIndex) return
    onArrange(orderedIds, arrayMove(orderedIds, fromIndex, toIndex))
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    move(orderedIds.indexOf(String(active.id)), orderedIds.indexOf(String(over.id)))
  }

  return (
    <section aria-label={`Arrange ${group.name}`} className="space-y-2">
      <h2 className="flex items-baseline gap-2 px-1 text-sm font-semibold">
        {group.name}
        <span className="font-normal text-muted-foreground tabular-nums">{items.length}</span>
        {isSaving && <span className="ml-auto text-xs font-normal text-muted-foreground" aria-live="polite">Saving…</span>}
      </h2>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={orderedIds} strategy={verticalListSortingStrategy} disabled={isDisabled}>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
            {items.map((item, index) => (
              <ArrangeRow
                key={item.id}
                item={item}
                position={index + 1}
                isFirst={index === 0}
                isLast={index === items.length - 1}
                isDisabled={isDisabled}
                onMoveUp={() => move(index, index - 1)}
                onMoveDown={() => move(index, index + 1)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </section>
  )
}

interface ArrangeRowProps {
  item: AdminMenuListItem
  position: number
  isFirst: boolean
  isLast: boolean
  isDisabled: boolean
  onMoveUp: () => void
  onMoveDown: () => void
}

const ARROW_BUTTON =
  'inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30'

function ArrangeRow({ item, position, isFirst, isLast, isDisabled, onMoveUp, onMoveDown }: ArrangeRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'relative flex items-center gap-2 bg-card py-2 pl-1 pr-1 sm:pr-2',
        isDragging && 'z-10 shadow-lg ring-1 ring-border',
      )}
    >
      <button
        type="button"
        className={cn(ARROW_BUTTON, 'cursor-grab touch-none active:cursor-grabbing')}
        aria-label={`Drag to move ${item.name}`}
        disabled={isDisabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-5 w-5" />
      </button>

      <span className="w-6 shrink-0 text-center text-xs text-muted-foreground tabular-nums">{position}</span>

      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-muted">
        <OptimizedImage src={item.image_url} alt="" fill className="object-cover" sizes="44px" loading="lazy" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{item.name}</p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatPrice(item.discounted_price || item.price)}
          </span>
          {!item.is_available && <Badge variant="secondary">Out of stock</Badge>}
        </div>
      </div>

      <button
        type="button"
        className={ARROW_BUTTON}
        onClick={onMoveUp}
        disabled={isDisabled || isFirst}
        aria-label={`Move ${item.name} up`}
      >
        <ChevronUp className="h-5 w-5" />
      </button>
      <button
        type="button"
        className={ARROW_BUTTON}
        onClick={onMoveDown}
        disabled={isDisabled || isLast}
        aria-label={`Move ${item.name} down`}
      >
        <ChevronDown className="h-5 w-5" />
      </button>
    </li>
  )
}
