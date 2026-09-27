'use client'

import { ChevronRight, Plus } from 'lucide-react'
import type { BoostItem } from '@/lib/boost/workspace'
import { DishPhoto, DishStack } from './dish'
import { listNames, peso, type ItemLookup } from './boost-model'

interface ItemSlotProps {
  item: BoostItem | undefined
  placeholder: string
  onClick: () => void
  trailing?: string
}

/** A big, tappable "this item" field that opens the picker. */
export function ItemSlot({ item, placeholder, onClick, trailing }: ItemSlotProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {item ? (
        <DishPhoto item={item} size="lg" />
      ) : (
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-dashed text-muted-foreground">
          <Plus className="h-5 w-5" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={item ? 'block truncate font-semibold' : 'block text-sm text-muted-foreground'}>
          {item?.name ?? placeholder}
        </span>
        {item && (
          <span className="block text-sm text-muted-foreground">
            {peso(item.price)}
            {item.categoryName ? ` · ${item.categoryName}` : ''}
          </span>
        )}
      </span>
      {trailing && (
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          {trailing}
        </span>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  )
}

interface ItemsSlotProps {
  ids: readonly string[]
  itemsById: ItemLookup
  placeholder: string
  onClick: () => void
}

/** The multi-item version: a photo stack and the names, one tap to change. */
export function ItemsSlot({ ids, itemsById, placeholder, onClick }: ItemsSlotProps) {
  const chosen = ids.map((id) => itemsById.get(id))
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {ids.length > 0 ? (
        <DishStack items={chosen} size="md" max={4} />
      ) : (
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-dashed text-muted-foreground">
          <Plus className="h-5 w-5" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        {ids.length > 0 ? (
          <>
            <span className="block truncate text-sm font-semibold">{listNames(ids, itemsById)}</span>
            <span className="block text-xs text-muted-foreground">{ids.length === 1 ? '1 item' : `${ids.length} items`}</span>
          </>
        ) : (
          <span className="block text-sm text-muted-foreground">{placeholder}</span>
        )}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  )
}
