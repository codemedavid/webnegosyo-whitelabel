'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import {
  ArrowUpDown,
  ChefHat,
  Download,
  MoreHorizontal,
  Package,
  PackagePlus,
  Pencil,
  Plus,
  Ruler,
  Search,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  buildInventoryCsv,
  filterInventoryRows,
  paginateRows,
  sortInventoryRows,
  toggleAllSelected,
  toggleSelected,
  type InventoryRow,
  type InventorySortKey,
  type SortDirection,
} from '@/lib/inventory/inventory-table'

const PAGE_SIZES = [10, 25, 50, 100] as const
const DEFAULT_PAGE_SIZE = 10

interface SortableColumn {
  key: InventorySortKey
  label: string
}

/**
 * Name leads, and the photo sits directly beside it.
 *
 * The code used to be wedged between the two, so the eye crossed an identifier
 * nobody scans by and a thumbnail before reaching the only column that
 * identifies the row. Sort order follows the same reading order.
 */
const SORTABLE_COLUMNS: SortableColumn[] = [
  { key: 'name', label: 'Name' },
  { key: 'code', label: 'SKU' },
  { key: 'group', label: 'Category' },
  { key: 'lastPurchase', label: 'Last Purchase' },
  { key: 'onHand', label: 'On Hand' },
]

const STOCK_LEVEL_LABEL = {
  low: 'Low stock',
  out: 'Out of stock',
} as const

export interface InventoryTableProps {
  rows: InventoryRow[]
  onCreate: () => void
  onEdit: (id: string) => void
  onStock: (id: string) => void
  onRecipe: (id: string) => void
  onDelete: (id: string) => void
  /** Opens the units list. Omitted by callers that manage units elsewhere. */
  onManageUnits?: () => void
  isCreateDisabled?: boolean
}

/**
 * Locale formatting happens on the client only — a date rendered in the
 * server's locale and re-rendered in the browser's is a hydration mismatch.
 */
function formatPurchaseDate(iso: string | null): string {
  if (!iso) return 'Never'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Never'
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

export function InventoryTable({
  rows,
  onCreate,
  onEdit,
  onStock,
  onRecipe,
  onDelete,
  onManageUnits,
  isCreateDisabled = false,
}: InventoryTableProps) {
  const [query, setQuery] = useState('')
  // Null until the merchant sorts: the server hands rows over already ordered
  // by name, and re-sorting them on mount would only risk disagreeing with it.
  const [sortKey, setSortKey] = useState<InventorySortKey | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE)
  const [selected, setSelected] = useState<string[]>([])
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const visible = useMemo(() => {
    const matching = filterInventoryRows(rows, query)
    return sortKey ? sortInventoryRows(matching, sortKey, sortDirection) : matching
  }, [rows, query, sortKey, sortDirection])
  const pageOf = paginateRows(visible, page, pageSize)
  const visibleIds = pageOf.rows.map((row) => row.id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id))

  const handleSort = (key: InventorySortKey) => {
    // Re-sorting reshuffles what is on the current page, so the merchant is
    // sent back to the top rather than into the middle of a new ordering.
    setPage(1)
    if (key === sortKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDirection('asc')
  }

  const handleSearch = (value: string) => {
    setQuery(value)
    setPage(1)
  }

  const downloadCsv = (exported: InventoryRow[]) => {
    const blob = new Blob([buildInventoryCsv(exported)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  // Exports what is on screen, not the whole pantry: a merchant who filtered
  // to "Meat" and hit Export means the meat.
  const handleExport = () => downloadCsv(visible)

  /*
    Selection used to end in a counter and nothing else — the checkboxes were a
    promise the screen never kept, which teaches a merchant that other controls
    may be decoration too. Export is the payoff the machinery already supported:
    the rows are in hand and the CSV builder takes any list.
  */
  const handleExportSelected = () => {
    downloadCsv(rows.filter((row) => selected.includes(row.id)))
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Package className="h-4.5 w-4.5" />
          </span>
          <div>
            {/* Was "Inventory Management", restating the page's own <h1> two
                hundred pixels above it. This names the list instead. */}
            <h2 className="text-base font-semibold leading-tight">Ingredients</h2>
            <p className="text-xs text-muted-foreground">
              {rows.length} {rows.length === 1 ? 'ingredient' : 'ingredients'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search takes its own line on a phone; the two buttons share the
              next one, so neither becomes a full-width slab. */}
          <div className="relative min-w-[200px] flex-1 max-sm:w-full max-sm:flex-none">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9 max-sm:h-11"
              placeholder="Search"
              value={query}
              onChange={(event) => handleSearch(event.target.value)}
            />
          </div>
          {onManageUnits && (
            <Button
              type="button"
              variant="outline"
              className="max-sm:h-11 max-sm:flex-1"
              onClick={onManageUnits}
            >
              <Ruler className="mr-2 h-4 w-4" />
              Units
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="max-sm:h-11 max-sm:flex-1"
            onClick={handleExport}
          >
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button
            type="button"
            className="max-sm:h-11 max-sm:flex-1"
            onClick={onCreate}
            disabled={isCreateDisabled}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add ingredient
          </Button>
        </div>
      </div>

      {/* Selection earns a bar of its own, so what the checkboxes are for is
          answered the moment the first one is ticked. */}
      {selected.length > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 border-b bg-muted/50 px-4 py-3"
        >
          <p className="text-sm font-medium">
            {selected.length} {selected.length === 1 ? 'ingredient' : 'ingredients'} selected
          </p>
          <div className="flex flex-wrap items-center gap-2 max-sm:w-full">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="max-sm:h-11 max-sm:flex-1"
              onClick={handleExportSelected}
            >
              <Download className="mr-2 h-4 w-4" />
              Export selected
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="max-sm:h-11 max-sm:flex-1"
              onClick={() => setSelected([])}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/*
        One row, two shapes. Below `md` the table elements are re-laid out as a
        card — a wrapping flex row whose cells are ordered by hand — rather than
        rendered twice and hidden by breakpoint. Duplicated markup would give
        every control two accessible copies in the same DOM, and a phone is the
        primary scene here, not the fallback.
      */}
      <div className="overflow-x-auto max-md:overflow-visible">
        <table className="w-full text-sm max-md:block">
          <thead className="max-md:hidden">
            <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  aria-label="Select all"
                  checked={allVisibleSelected}
                  onChange={() => setSelected((current) => toggleAllSelected(current, visibleIds))}
                />
              </th>
              <th scope="col" className="px-4 py-3">
                Photo
              </th>
              {SORTABLE_COLUMNS.map((column) => (
                <SortableHeader
                  key={column.key}
                  column={column}
                  activeKey={sortKey}
                  direction={sortDirection}
                  onSort={handleSort}
                />
              ))}
              <th scope="col" className="px-4 py-3 text-right">
                Actions
              </th>
            </tr>
          </thead>

          <tbody className="max-md:block max-md:space-y-3 max-md:p-3">
            {pageOf.rows.map((row) => (
              <tr
                key={row.id}
                data-testid="inventory-row"
                className="hover:bg-muted/30 md:border-b md:last:border-0 max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-3 max-md:gap-y-2 max-md:rounded-xl max-md:border max-md:bg-card max-md:p-4"
              >
                <td className="px-4 py-3 max-md:order-1 max-md:p-0">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary max-md:h-5 max-md:w-5"
                    aria-label={`Select ${row.name}`}
                    checked={selected.includes(row.id)}
                    onChange={() => setSelected((current) => toggleSelected(current, row.id))}
                  />
                </td>
                <td className="px-4 py-3 max-md:order-2 max-md:p-0">
                  {row.imageUrl ? (
                    <Image
                      data-testid="inventory-photo"
                      src={row.imageUrl}
                      // Decorative: the item's name sits in the next cell, so a
                      // spoken alt here would only repeat it.
                      alt=""
                      width={36}
                      height={36}
                      className="h-9 w-9 rounded-full object-cover"
                    />
                  ) : (
                    <span
                      data-testid="inventory-photo-placeholder"
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground"
                    >
                      <Package className="h-4 w-4" />
                    </span>
                  )}
                </td>
                <td className="min-w-0 max-w-[26ch] px-4 py-3 max-md:order-3 max-md:max-w-none max-md:flex-1 max-md:p-0">
                  <div className="flex items-center gap-2">
                    {/* A 100-character ingredient name must not stretch the
                        table off the page; the full text stays on hover. */}
                    <span
                      data-testid="inventory-row-name"
                      className="truncate font-medium max-md:text-base"
                      title={row.name}
                    >
                      {row.name}
                    </span>
                    {row.isPrep && <Badge variant="secondary">Prep</Badge>}
                    {!row.isActive && <Badge variant="outline">Not in use</Badge>}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground max-md:order-7 max-md:p-0">
                  {row.code}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground max-md:order-5 max-md:min-w-0 max-md:truncate max-md:p-0 max-md:text-xs">
                  {row.group}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground max-md:order-6 max-md:p-0 max-md:text-xs">
                  {formatPurchaseDate(row.lastPurchaseAt)}
                </td>
                {/*
                  On a phone this is the line the merchant came for, so it takes
                  a row of its own at the size of a headline. The alert icon
                  carries the level for the table; below `md` the same level is
                  spelled out, because colour and a 14px triangle are not a label
                  in a kitchen or in daylight.
                */}
                <td className="whitespace-nowrap px-4 py-3 max-md:order-4 max-md:w-full max-md:whitespace-normal max-md:p-0">
                  <span className="inline-flex items-center gap-1.5 max-md:flex-wrap">
                    <span
                      className={cn(
                        'max-md:text-xl max-md:font-semibold max-md:tabular-nums',
                        row.stockLevel !== 'ok' && 'font-medium text-destructive',
                      )}
                    >
                      {row.onHandLabel}
                    </span>
                    {row.stockLevel !== 'ok' && (
                      <>
                        <TriangleAlert
                          className="h-3.5 w-3.5 text-destructive"
                          aria-label={STOCK_LEVEL_LABEL[row.stockLevel]}
                        />
                        <span
                          aria-hidden
                          className="hidden text-xs font-medium text-destructive max-md:inline"
                        >
                          {STOCK_LEVEL_LABEL[row.stockLevel]}
                        </span>
                      </>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3 max-md:order-8 max-md:w-full max-md:p-0">
                  <div className="flex items-center justify-end gap-1 max-md:gap-2">
                    {/*
                      Recording stock is the reason this screen exists — every
                      delivery, every count, every spill. Editing a SKU happens
                      monthly. So Record is the named control on the row and
                      Edit moves into the menu, rather than the other way round.
                    */}
                    <Button
                      type="button"
                      variant="outline"
                      className="max-md:h-11 max-md:flex-1"
                      aria-label={`Record stock for ${row.name}`}
                      onClick={() => onStock(row.id)}
                    >
                      <PackagePlus className="mr-2 h-4 w-4" />
                      Record
                    </Button>
                    <RowActionsMenu
                      row={row}
                      isOpen={openMenuId === row.id}
                      onToggle={() => setOpenMenuId((current) => (current === row.id ? null : row.id))}
                      onEdit={onEdit}
                      onRecipe={onRecipe}
                      onDelete={onDelete}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {pageOf.rows.length === 0 && (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            {rows.length === 0
              ? 'No ingredients yet. Add raw materials (flour, cheese) or prep items to build recipes and track cost.'
              : 'No ingredients match this search.'}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="flex flex-col gap-3 border-t p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground">
          {`Showing ${pageOf.from} - ${pageOf.to} of ${pageOf.total} entries`}
        </p>

        <div className="flex items-center gap-3 max-sm:flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="max-sm:h-11 max-sm:flex-1 max-sm:px-4"
            aria-label="Previous page"
            disabled={pageOf.page <= 1}
            onClick={() => setPage(pageOf.page - 1)}
          >
            Prev
          </Button>
          <span className="text-muted-foreground tabular-nums">
            {pageOf.page} / {pageOf.pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="max-sm:h-11 max-sm:flex-1 max-sm:px-4"
            aria-label="Next page"
            disabled={pageOf.page >= pageOf.pageCount}
            onClick={() => setPage(pageOf.page + 1)}
          >
            Next
          </Button>

          <label className="flex items-center gap-2 text-muted-foreground max-sm:w-full">
            Show
            <select
              aria-label="Entries per page"
              className="h-9 rounded-md border bg-background px-2 text-sm max-sm:h-11 max-sm:flex-1"
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value))
                setPage(1)
              }}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            entries
          </label>
        </div>
      </div>
    </div>
  )
}

interface SortButtonProps {
  column: SortableColumn
  activeKey: InventorySortKey | null
  direction: SortDirection
  onSort: (key: InventorySortKey) => void
}

/** `aria-sort` belongs to the header cell, not to the control inside it. */
function SortableHeader({ column, activeKey, direction, onSort }: SortButtonProps) {
  const isActive = activeKey === column.key

  return (
    <th
      scope="col"
      className="px-4 py-3"
      aria-sort={isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-sm uppercase tracking-wide hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        aria-label={`Sort by ${column.label}`}
        onClick={() => onSort(column.key)}
      >
        {column.label}
        <ArrowUpDown className={`h-3 w-3 ${isActive ? 'text-foreground' : 'opacity-50'}`} />
      </button>
    </th>
  )
}

interface RowActionsMenuProps {
  row: InventoryRow
  isOpen: boolean
  onToggle: () => void
  onEdit: (id: string) => void
  onRecipe: (id: string) => void
  onDelete: (id: string) => void
}

/**
 * A plain menu rather than a portalled one: it lives inside a table cell, has
 * three items at most, and closing it is the caller's single piece of state.
 *
 * It declares `role="menu"`, so it owes the keyboard the contract that role
 * promises: arrows move between items, Home and End jump to the ends, Escape
 * closes and hands focus back to the trigger, and a click anywhere else
 * dismisses it. Declaring the role without implementing it is worse than not
 * declaring it — a screen reader announces a menu the user cannot drive.
 */
function RowActionsMenu({ row, isOpen, onToggle, onEdit, onRecipe, onDelete }: RowActionsMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const close = useCallback(
    ({ restoreFocus }: { restoreFocus: boolean }) => {
      onToggle()
      if (restoreFocus) triggerRef.current?.focus()
    },
    [onToggle],
  )

  // Opening moves focus into the menu, so the keyboard lands where the eye does.
  useEffect(() => {
    if (!isOpen) return
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      close({ restoreFocus: false })
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      close({ restoreFocus: true })
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, close])

  const run = (action: (id: string) => void) => {
    onToggle()
    action(row.id)
  }

  /** Arrow, Home and End roving across whatever items this row actually has. */
  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    )
    if (items.length === 0) return

    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    const focusAt = (index: number) => {
      event.preventDefault()
      items[(index + items.length) % items.length]?.focus()
    }

    if (event.key === 'ArrowDown') return focusAt(current + 1)
    if (event.key === 'ArrowUp') return focusAt(current - 1)
    if (event.key === 'Home') return focusAt(0)
    if (event.key === 'End') return focusAt(items.length - 1)
  }

  return (
    <div className="relative">
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="icon"
        className="max-md:size-11"
        aria-label={`More actions for ${row.name}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>

      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Actions for ${row.name}`}
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-md border bg-popover p-1 text-left shadow-md"
        >
          <MenuItem icon={<Pencil className="h-4 w-4" />} label="Edit" onSelect={() => run(onEdit)} />
          {row.isPrep && (
            <MenuItem icon={<ChefHat className="h-4 w-4" />} label="Recipe" onSelect={() => run(onRecipe)} />
          )}
          <MenuItem
            icon={<Trash2 className="h-4 w-4" />}
            label="Delete"
            isDestructive
            onSelect={() => run(onDelete)}
          />
        </div>
      )}
    </div>
  )
}

interface MenuItemProps {
  icon: React.ReactNode
  label: string
  isDestructive?: boolean
  onSelect: () => void
}

function MenuItem({ icon, label, isDestructive = false, onSelect }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent',
        'focus-visible:bg-accent focus-visible:outline-none max-md:min-h-11',
        isDestructive && 'text-destructive',
      )}
      onClick={onSelect}
    >
      {icon}
      {label}
    </button>
  )
}
