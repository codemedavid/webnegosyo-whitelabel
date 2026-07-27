'use client'

import { useMemo, useState } from 'react'
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
  Search,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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

const SORTABLE_COLUMNS: SortableColumn[] = [
  { key: 'code', label: 'Item Code' },
  { key: 'name', label: 'Item Name' },
  { key: 'group', label: 'Item Group' },
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

  const handleExport = () => {
    // Exports what is on screen, not the whole pantry: a merchant who filtered
    // to "Meat" and hit Export means the meat.
    const blob = new Blob([buildInventoryCsv(visible)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
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
            <h2 className="text-base font-semibold leading-tight">Inventory Management</h2>
            <p className="text-xs text-muted-foreground">
              {selected.length > 0
                ? `${selected.length} selected`
                : `${rows.length} ${rows.length === 1 ? 'ingredient' : 'ingredients'}`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search"
              value={query}
              onChange={(event) => handleSearch(event.target.value)}
            />
          </div>
          <Button type="button" variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button type="button" onClick={onCreate} disabled={isCreateDisabled}>
            <Plus className="mr-2 h-4 w-4" />
            Add Item
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
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
                <SortButton column={SORTABLE_COLUMNS[0]} activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
              </th>
              <th scope="col" className="px-4 py-3">
                Photo
              </th>
              {SORTABLE_COLUMNS.slice(1).map((column) => (
                <th key={column.key} scope="col" className="px-4 py-3">
                  <SortButton column={column} activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                </th>
              ))}
              <th scope="col" className="px-4 py-3 text-right">
                Actions
              </th>
            </tr>
          </thead>

          <tbody>
            {pageOf.rows.map((row) => (
              <tr key={row.id} data-testid="inventory-row" className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    aria-label={`Select ${row.name}`}
                    checked={selected.includes(row.id)}
                    onChange={() => setSelected((current) => toggleSelected(current, row.id))}
                  />
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">
                  {row.code}
                </td>
                <td className="px-4 py-3">
                  {row.imageUrl ? (
                    <Image
                      src={row.imageUrl}
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
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span data-testid="inventory-row-name" className="font-medium">
                      {row.name}
                    </span>
                    {row.isPrep && <Badge variant="secondary">Prep</Badge>}
                    {!row.isActive && <Badge variant="outline">Inactive</Badge>}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{row.group}</td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {formatPurchaseDate(row.lastPurchaseAt)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={row.stockLevel === 'ok' ? '' : 'font-medium text-destructive'}>
                      {row.onHandLabel}
                    </span>
                    {row.stockLevel !== 'ok' && (
                      <TriangleAlert
                        className="h-3.5 w-3.5 text-destructive"
                        aria-label={STOCK_LEVEL_LABEL[row.stockLevel]}
                      />
                    )}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${row.name}`}
                      onClick={() => onEdit(row.id)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <RowActionsMenu
                      row={row}
                      isOpen={openMenuId === row.id}
                      onToggle={() => setOpenMenuId((current) => (current === row.id ? null : row.id))}
                      onStock={onStock}
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

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="Previous page"
            disabled={pageOf.page <= 1}
            onClick={() => setPage(pageOf.page - 1)}
          >
            Prev
          </Button>
          <span className="text-muted-foreground">
            {pageOf.page} / {pageOf.pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="Next page"
            disabled={pageOf.page >= pageOf.pageCount}
            onClick={() => setPage(pageOf.page + 1)}
          >
            Next
          </Button>

          <label className="flex items-center gap-2 text-muted-foreground">
            Show
            <select
              aria-label="Entries per page"
              className="h-8 rounded-md border bg-background px-2 text-sm"
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

function SortButton({ column, activeKey, direction, onSort }: SortButtonProps) {
  const isActive = activeKey === column.key

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground"
      aria-label={`Sort by ${column.label}`}
      aria-sort={isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      onClick={() => onSort(column.key)}
    >
      {column.label}
      <ArrowUpDown className={`h-3 w-3 ${isActive ? 'text-foreground' : 'opacity-50'}`} />
    </button>
  )
}

interface RowActionsMenuProps {
  row: InventoryRow
  isOpen: boolean
  onToggle: () => void
  onStock: (id: string) => void
  onRecipe: (id: string) => void
  onDelete: (id: string) => void
}

/**
 * A plain menu rather than a portalled one: it lives inside a table cell, has
 * three items at most, and closing it is the caller's single piece of state.
 */
function RowActionsMenu({ row, isOpen, onToggle, onStock, onRecipe, onDelete }: RowActionsMenuProps) {
  const run = (action: (id: string) => void) => {
    onToggle()
    action(row.id)
  }

  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`More actions for ${row.name}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-md border bg-popover p-1 text-left shadow-md"
        >
          <MenuItem icon={<PackagePlus className="h-4 w-4" />} label="Record stock" onSelect={() => run(onStock)} />
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
      className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent ${
        isDestructive ? 'text-destructive' : ''
      }`}
      onClick={onSelect}
    >
      {icon}
      {label}
    </button>
  )
}
