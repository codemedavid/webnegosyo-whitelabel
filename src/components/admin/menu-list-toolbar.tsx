'use client'

/**
 * Menu management's filter bar: search, category, and status chips whose
 * counts come from the same predicate the grid uses.
 */

import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CategoryIcon } from '@/components/shared/category-icon'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MENU_STATUS_FILTERS, type MenuListFilters, type MenuStatusFilter } from '@/lib/menu-list-filters'
import type { Category } from '@/types/database'

interface MenuListToolbarProps {
  filters: MenuListFilters
  counts: Record<MenuStatusFilter, number>
  categories: readonly Category[]
  onChange: (next: MenuListFilters) => void
}

export function MenuListToolbar({ filters, counts, categories, onChange }: MenuListToolbarProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            aria-label="Search dishes"
            placeholder="Search dishes…"
            value={filters.query}
            onChange={(e) => onChange({ ...filters, query: e.target.value })}
            className="h-10 w-full rounded-lg border bg-background pl-9 pr-9 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:appearance-none"
          />
          {filters.query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onChange({ ...filters, query: '' })}
              className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="shrink-0 sm:w-[220px]">
        <Select value={filters.categoryId} onValueChange={(categoryId) => onChange({ ...filters, categoryId })}>
          <SelectTrigger className="h-10 w-full" aria-label="Category">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                <span className="flex items-center gap-2">
                  <CategoryIcon icon={category.icon} color={category.icon_color} size="sm" />
                  {category.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        </div>
      </div>

      <div role="tablist" aria-label="Status" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5">
        {MENU_STATUS_FILTERS.map(({ value, label }) => {
          const isActive = filters.status === value
          return (
            <button
              key={value}
              role="tab"
              type="button"
              aria-selected={isActive}
              onClick={() => onChange({ ...filters, status: value })}
              className={cn(
                'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors',
                isActive
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground',
              )}
            >
              {label}
              <span className={cn('tabular-nums', isActive ? 'opacity-70' : 'opacity-60')}>{counts[value]}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
