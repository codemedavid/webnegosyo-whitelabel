'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronLeft, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { BoostItem } from '@/lib/boost/workspace'
import { DishPhoto } from './dish'
import { peso } from './boost-model'

export interface ItemPickerProps {
  items: readonly BoostItem[]
  mode: 'single' | 'multi'
  title: string
  hint?: string
  selectedIds: readonly string[]
  max?: number
  /** Shown first, each with a short reason ("Bigger version"). */
  suggestions?: readonly { id: string; reason: string }[]
  excludeIds?: readonly string[]
  onDone: (ids: string[]) => void
  onBack: () => void
}

const ALL = '__all__'

/**
 * Choosing dishes, as a panel that pushes in over the editor instead of a
 * dialog stacked on a sheet. One search box, category chips, big tap targets —
 * built for a thumb on a phone mid-service.
 */
export function ItemPicker({
  items,
  mode,
  title,
  hint,
  selectedIds,
  max,
  suggestions = [],
  excludeIds = [],
  onDone,
  onBack,
}: ItemPickerProps) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(ALL)
  const [selection, setSelection] = useState<string[]>([...selectedIds])
  const isAtMax = max !== undefined && selection.length >= max

  const excluded = useMemo(() => new Set(excludeIds), [excludeIds])
  const pool = useMemo(() => items.filter((item) => !excluded.has(item.id)), [items, excluded])

  const categories = useMemo(() => {
    const seen = new Map<string, string>()
    for (const item of pool) {
      if (item.categoryId && item.categoryName) seen.set(item.categoryId, item.categoryName)
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }))
  }, [pool])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return pool
      .filter((item) => category === ALL || item.categoryId === category)
      .filter((item) => !q || item.name.toLowerCase().includes(q))
      .sort((a, b) => Number(b.isAvailable) - Number(a.isAvailable))
  }, [pool, category, query])

  const suggestionRows = useMemo(() => {
    if (query.trim() || category !== ALL) return []
    return suggestions
      .map((s) => ({ item: pool.find((i) => i.id === s.id), reason: s.reason }))
      .filter((row): row is { item: BoostItem; reason: string } => !!row.item)
  }, [suggestions, pool, query, category])

  const toggle = (id: string) => {
    if (mode === 'single') {
      onDone([id])
      return
    }
    setSelection((current) => {
      if (current.includes(id)) return current.filter((x) => x !== id)
      if (max !== undefined && current.length >= max) return current
      return [...current, id]
    })
  }

  const categoryIds = visible.map((item) => item.id)
  const allInCategorySelected = categoryIds.length > 0 && categoryIds.every((id) => selection.includes(id))
  const canSelectCategory = mode === 'multi' && category !== ALL && max === undefined

  const selectCategory = () => {
    setSelection((current) =>
      allInCategorySelected
        ? current.filter((id) => !categoryIds.includes(id))
        : [...new Set([...current, ...categoryIds])]
    )
  }

  const renderRow = (item: BoostItem, reason?: string) => {
    const isSelected = selection.includes(item.id)
    const isDisabled = mode === 'multi' && !isSelected && isAtMax
    return (
      <li key={`${reason ? 's-' : ''}${item.id}`}>
        <button
          type="button"
          onClick={() => toggle(item.id)}
          disabled={isDisabled}
          aria-pressed={mode === 'multi' ? isSelected : undefined}
          className={cn(
            'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
            'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            isSelected && 'bg-primary/[0.06]',
            isDisabled && 'cursor-not-allowed opacity-40'
          )}
        >
          <DishPhoto item={item} size="md" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{item.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {reason ? <span className="font-medium text-emerald-700 dark:text-emerald-400">{reason} · </span> : null}
              {peso(item.price)}
              {item.categoryName ? ` · ${item.categoryName}` : ''}
              {!item.isAvailable ? ' · Out of stock' : ''}
            </span>
          </span>
          <span
            aria-hidden="true"
            className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
              isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30'
            )}
          >
            {isSelected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
          </span>
        </button>
      </li>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-3">
        <Button type="button" variant="ghost" size="icon" onClick={onBack} aria-label="Back">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold">{title}</h3>
          {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>

      <div className="space-y-3 border-b px-4 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search your menu"
            className="h-11 pl-9 text-base sm:text-sm"
            aria-label="Search your menu"
          />
        </div>
        {categories.length > 1 && (
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
            {[{ id: ALL, name: 'All' }, ...categories].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  category === cat.id
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border text-muted-foreground hover:text-foreground'
                )}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {canSelectCategory && categoryIds.length > 1 && (
          <button
            type="button"
            onClick={selectCategory}
            className="mb-1 w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-primary hover:bg-muted"
          >
            {allInCategorySelected ? 'Clear this category' : `Select all ${categoryIds.length} in this category`}
          </button>
        )}
        {suggestionRows.length > 0 && (
          <>
            <p className="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">Suggested</p>
            <ul>{suggestionRows.map((row) => renderRow(row.item, row.reason))}</ul>
            <p className="px-3 pb-1 pt-4 text-xs font-medium text-muted-foreground">Everything else</p>
          </>
        )}
        {visible.length === 0 ? (
          <p className="px-3 py-10 text-center text-sm text-muted-foreground">
            {query ? `Nothing on your menu matches “${query}”.` : 'No items here yet.'}
          </p>
        ) : (
          <ul>{visible.map((item) => renderRow(item))}</ul>
        )}
      </div>

      {mode === 'multi' && (
        <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
          <p className="text-sm text-muted-foreground">
            {selection.length === 0
              ? 'Nothing selected'
              : `${selection.length} selected${max ? ` of ${max}` : ''}`}
          </p>
          <Button type="button" onClick={() => onDone(selection)} disabled={selection.length === 0}>
            Done
          </Button>
        </div>
      )}
    </div>
  )
}
