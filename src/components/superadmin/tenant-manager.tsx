'use client'

import { useState, useCallback, memo } from 'react'
import Link from 'next/link'
import {
  ChevronLeft,
  ChevronRight,
  Edit,
  ExternalLink,
  Eye,
  LayoutGrid,
  List,
  MoreVertical,
  Power,
  PowerOff,
  Search,
  SlidersHorizontal,
  Store,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { RangeTabs, StatusBadge } from '@/components/superadmin/ui/primitives'
import { formatCurrencyCompact } from '@/components/superadmin/ui/format'
import {
  TenantMonogram,
  TenantFeatureChips,
  TenantHealthDot,
  formatRelativeTime,
} from '@/components/superadmin/tenant-visuals'
import { useDeleteTenant } from '@/lib/queries/tenants'
import { useTenantList } from '@/components/superadmin/use-tenant-list'
import {
  bulkSetTenantsActiveAction,
  bulkDeleteTenantsAction,
} from '@/actions/tenants'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Tenant } from '@/types/database'
import type { TenantMetrics } from '@/lib/queries/tenant-metrics-server'
import type {
  TenantSort,
  TenantStatusFilter,
  TenantFeatureFilter,
} from '@/lib/superadmin/tenant-search'

const PAGE_SIZE = 20
const VIEW_STORAGE_KEY = 'sa-tenant-view'
const EMPTY_SELECTION: ReadonlySet<string> = new Set()

type TenantView = 'table' | 'grid'

interface TenantManagerProps {
  initialTenants: Tenant[]
  initialCount: number
  /** The ?q= the server rendered the first page for. */
  initialSearch: string
}

/* -----------------------------------------------------------------------------
   Row actions (shared between table rows and cards)
----------------------------------------------------------------------------- */
function TenantRowMenu({
  tenant,
  onDelete,
}: {
  tenant: Tenant
  onDelete: (tenant: Tenant) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Actions for ${tenant.name}`}
          className="h-8 w-8 text-white/45 hover:bg-white/10 hover:text-white"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem asChild>
          <Link href={`/superadmin/tenants/${tenant.id}`} prefetch>
            <Edit className="mr-2 h-4 w-4" />
            Edit tenant
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/${tenant.slug}/menu`} target="_blank">
            <Eye className="mr-2 h-4 w-4" />
            View live menu
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-red-400 focus:text-red-400"
          onClick={(e) => {
            e.preventDefault()
            onDelete(tenant)
          }}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete tenant
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Placeholder while a row's metrics load, or "—" when they could not. */
function MetricsPending({ isLoading }: { isLoading: boolean }) {
  if (!isLoading) {
    return <span className="text-sm text-white/35">—</span>
  }
  return (
    <span className="flex flex-col gap-1.5" aria-label="Loading order stats">
      <span className="h-3.5 w-24 animate-pulse rounded bg-white/[0.06]" />
      <span className="h-3 w-16 animate-pulse rounded bg-white/[0.06]" />
    </span>
  )
}

/** Compact activity readout: "<orders30d> orders · GMV" + health dot + relative. */
function TenantActivity({
  metrics,
  isMetricsLoading,
  className,
}: {
  metrics: TenantMetrics | undefined
  isMetricsLoading: boolean
  className?: string
}) {
  if (!metrics) return <MetricsPending isLoading={isMetricsLoading} />
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <span className="text-sm text-white/70">
        {metrics.orders30d} {metrics.orders30d === 1 ? 'order' : 'orders'}
        <span className="text-white/30"> · </span>
        <span className="text-white/55">
          {formatCurrencyCompact(metrics.gmvLifetime)}
        </span>
      </span>
      <span className="inline-flex items-center gap-1.5 text-xs text-white/45">
        <TenantHealthDot lastOrderAt={metrics.lastOrderAt} />
        {formatRelativeTime(metrics.lastOrderAt)}
      </span>
    </div>
  )
}

/* -----------------------------------------------------------------------------
   Dense desktop table row — the whole row is a click target to the detail page.
----------------------------------------------------------------------------- */
interface TenantTableRowProps {
  tenant: Tenant
  metrics: TenantMetrics | undefined
  isMetricsLoading: boolean
  selected: boolean
  onToggleSelect: (id: string) => void
  onDelete: (tenant: Tenant) => void
}

const TenantTableRow = memo(
  ({ tenant, metrics, isMetricsLoading, selected, onToggleSelect, onDelete }: TenantTableRowProps) => (
    <div className="group relative flex items-center gap-4 px-4 py-3 transition-colors hover:bg-white/[0.035]">
      {/* Full-row click target */}
      <Link
        href={`/superadmin/tenants/${tenant.id}`}
        prefetch
        aria-label={`Edit ${tenant.name}`}
        className="absolute inset-0 z-0 rounded-none focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/30"
      />

      {/* Select checkbox */}
      <div
        className="relative z-[1] flex w-5 shrink-0 items-center"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onToggleSelect(tenant.id)
        }}
      >
        <Checkbox
          checked={selected}
          aria-label={`Select ${tenant.name}`}
          className="border-white/20"
        />
      </div>

      <TenantMonogram tenant={tenant} size="sm" className="relative z-[1]" />

      {/* Name + slug */}
      <div className="relative z-[1] min-w-0 flex-1 pointer-events-none">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-white">{tenant.name}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-white/40">
          <span className="truncate">/{tenant.slug}</span>
          {tenant.domain ? (
            <>
              <span className="text-white/20">•</span>
              <span className="truncate text-white/45">{tenant.domain}</span>
            </>
          ) : null}
        </div>
      </div>

      {/* Activity */}
      <div className="relative z-[1] hidden w-[160px] shrink-0 md:block pointer-events-none">
        <TenantActivity metrics={metrics} isMetricsLoading={isMetricsLoading} />
      </div>

      {/* Feature chips (hidden on small) */}
      <div className="relative z-[1] hidden shrink-0 lg:block pointer-events-none">
        <TenantFeatureChips tenant={tenant} />
      </div>

      {/* Status */}
      <div className="relative z-[1] hidden shrink-0 sm:block pointer-events-none">
        <StatusBadge active={tenant.is_active} />
      </div>

      {/* Quick actions */}
      <div className="relative z-[1] flex shrink-0 items-center gap-1">
        <Button
          asChild
          variant="ghost"
          size="icon"
          aria-label={`Open ${tenant.name} live menu`}
          className="hidden h-8 w-8 text-white/45 hover:bg-white/10 hover:text-white sm:inline-flex"
          onClick={(e) => e.stopPropagation()}
        >
          <Link href={`/${tenant.slug}/menu`} target="_blank">
            <ExternalLink className="h-4 w-4" />
          </Link>
        </Button>
        <TenantRowMenu tenant={tenant} onDelete={onDelete} />
      </div>
    </div>
  ),
)
TenantTableRow.displayName = 'TenantTableRow'

/* -----------------------------------------------------------------------------
   Rich card — used for the grid view and always on mobile.
----------------------------------------------------------------------------- */
interface TenantCardProps {
  tenant: Tenant
  metrics: TenantMetrics | undefined
  isMetricsLoading: boolean
  selected: boolean
  onToggleSelect: (id: string) => void
  onDelete: (tenant: Tenant) => void
}

const TenantCard = memo(
  ({ tenant, metrics, isMetricsLoading, selected, onToggleSelect, onDelete }: TenantCardProps) => (
    <div className="group relative rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-white/20 hover:bg-white/[0.04]">
      {/* Full-card click target */}
      <Link
        href={`/superadmin/tenants/${tenant.id}`}
        prefetch
        aria-label={`Edit ${tenant.name}`}
        className="absolute inset-0 z-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/30"
      />

      <div className="relative z-[1] flex items-start gap-3">
        {/* Select checkbox (top-left) */}
        <div
          className="flex shrink-0 items-center pt-0.5"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onToggleSelect(tenant.id)
          }}
        >
          <Checkbox
            checked={selected}
            aria-label={`Select ${tenant.name}`}
            className="border-white/20"
          />
        </div>

        <TenantMonogram tenant={tenant} size="sm" />

        <div className="min-w-0 flex-1 pointer-events-none">
          <p className="truncate font-medium text-white">{tenant.name}</p>
          <p className="truncate text-xs text-white/40">/{tenant.slug}</p>
        </div>

        <div className="relative z-[1] flex shrink-0 items-center gap-1">
          <TenantRowMenu tenant={tenant} onDelete={onDelete} />
        </div>
      </div>

      {/* Metrics row */}
      <div className="relative z-[1] mt-3 flex items-center justify-between gap-2 pointer-events-none">
        {metrics ? (
          <>
            <span className="text-sm text-white/70">
              {metrics.orders30d} {metrics.orders30d === 1 ? 'order' : 'orders'}
              <span className="text-white/30"> · </span>
              <span className="text-white/55">
                {formatCurrencyCompact(metrics.gmvLifetime)}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-white/45">
              <TenantHealthDot lastOrderAt={metrics.lastOrderAt} />
              {formatRelativeTime(metrics.lastOrderAt)}
            </span>
          </>
        ) : (
          <MetricsPending isLoading={isMetricsLoading} />
        )}
      </div>

      <div className="relative z-[1] mt-3 flex items-center justify-between gap-2 pointer-events-none">
        <StatusBadge active={tenant.is_active} />
      </div>

      <div className="relative z-[1] mt-2 pointer-events-none">
        <TenantFeatureChips tenant={tenant} />
      </div>
    </div>
  ),
)
TenantCard.displayName = 'TenantCard'

/* -----------------------------------------------------------------------------
   Tenant manager — search, filter, sort, view toggle, bulk ops.
----------------------------------------------------------------------------- */
export function TenantManager({
  initialTenants,
  initialCount,
  initialSearch,
}: TenantManagerProps) {
  const {
    query,
    queryKey,
    search,
    setSearch,
    setStatus,
    setFeature,
    setSort,
    goToPage,
    tenants,
    count,
    isLoading,
    loadError,
    retry,
    metrics,
    isMetricsLoading,
    updateCurrentPage,
    invalidateLists,
  } = useTenantList({ initialTenants, initialCount, initialSearch })
  const { search: debouncedSearch, page, status, feature, sort } = query

  const [view, setView] = useState<TenantView>(() => {
    if (typeof window === 'undefined') return 'table'
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY)
    return stored === 'grid' || stored === 'table' ? stored : 'table'
  })

  /* Selection belongs to one result set: a new search, filter or page starts
     empty without an effect to clear it. */
  const [selection, setSelection] = useState<{ key: string; ids: ReadonlySet<string> }>(
    () => ({ key: queryKey, ids: new Set() }),
  )
  const selected = selection.key === queryKey ? selection.ids : EMPTY_SELECTION
  const setSelected = useCallback(
    (updater: (prev: ReadonlySet<string>) => ReadonlySet<string>) => {
      setSelection((prev) => ({
        key: queryKey,
        ids: updater(prev.key === queryKey ? prev.ids : EMPTY_SELECTION),
      }))
    },
    [queryKey],
  )

  const [tenantToDelete, setTenantToDelete] = useState<Tenant | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [isBulkBusy, setIsBulkBusy] = useState(false)
  const deleteMutation = useDeleteTenant()

  /* Persist view choice */
  const changeView = useCallback((next: TenantView) => {
    setView(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next)
    }
  }, [])

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE))
  const rangeStart = count === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(page * PAGE_SIZE, count)

  /* -------- selection -------- */
  const toggleSelect = useCallback(
    (id: string) => {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    },
    [setSelected],
  )

  const allSelected =
    tenants.length > 0 && tenants.every((t) => selected.has(t.id))

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) => {
      const everySelected =
        tenants.length > 0 && tenants.every((t) => prev.has(t.id))
      if (everySelected) return new Set()
      return new Set(tenants.map((t) => t.id))
    })
  }, [tenants, setSelected])

  const clearSelection = useCallback(() => setSelected(() => new Set()), [setSelected])

  /* -------- single delete (optimistic + rollback) -------- */
  const handleDelete = useCallback(() => {
    if (!tenantToDelete) return

    const deletedTenant = tenantToDelete

    updateCurrentPage((prev) => ({
      tenants: prev.tenants.filter((t) => t.id !== deletedTenant.id),
      count: Math.max(0, prev.count - 1),
    }))
    setSelected((prev) => {
      if (!prev.has(deletedTenant.id)) return prev
      const next = new Set(prev)
      next.delete(deletedTenant.id)
      return next
    })
    setTenantToDelete(null)

    deleteMutation.mutate(deletedTenant.id, {
      onSuccess: () => {
        toast.success(`${deletedTenant.name} has been deleted`)
      },
      onError: (error) => {
        const message =
          error instanceof Error ? error.message : 'Failed to delete tenant'
        toast.error(message)
      },
      // Success or failure, the server is the truth: refetch rather than
      // splice the row back in at the wrong position.
      onSettled: () => {
        void invalidateLists()
      },
    })
  }, [tenantToDelete, deleteMutation, updateCurrentPage, setSelected, invalidateLists])

  /* -------- bulk activate / deactivate -------- */
  const handleBulkSetActive = useCallback(
    async (isActive: boolean) => {
      const ids = Array.from(selected)
      if (!ids.length) return

      setIsBulkBusy(true)
      try {
        const result = await bulkSetTenantsActiveAction(ids, isActive)
        if (result.error) {
          toast.error(result.error)
          void invalidateLists()
          return
        }
        const idSet = new Set(ids)
        updateCurrentPage((prev) => ({
          ...prev,
          tenants: prev.tenants.map((t) =>
            idSet.has(t.id) ? { ...t, is_active: isActive } : t,
          ),
        }))
        void invalidateLists()
        clearSelection()
        toast.success(
          `${ids.length} ${ids.length === 1 ? 'restaurant' : 'restaurants'} ${
            isActive ? 'activated' : 'deactivated'
          }`,
        )
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to update restaurants'
        toast.error(message)
        void invalidateLists()
      } finally {
        setIsBulkBusy(false)
      }
    },
    [selected, clearSelection, updateCurrentPage, invalidateLists],
  )

  /* -------- bulk delete -------- */
  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selected)
    if (!ids.length) return

    setIsBulkBusy(true)
    try {
      const result = await bulkDeleteTenantsAction(ids)
      if (result.error) {
        toast.error(result.error)
        void invalidateLists()
        return
      }
      const failedIds = new Set(result.failed ?? [])
      // Only drop tenants that were actually deleted; keep any that failed.
      const removedIds = ids.filter((id) => !failedIds.has(id))
      const removedSet = new Set(removedIds)
      const removed = result.deleted ?? removedIds.length
      updateCurrentPage((prev) => ({
        tenants: prev.tenants.filter((t) => !removedSet.has(t.id)),
        count: Math.max(0, prev.count - removedIds.length),
      }))
      void invalidateLists()
      clearSelection()
      setBulkDeleteOpen(false)
      if (failedIds.size > 0) {
        toast.error(
          `${removed} deleted, ${failedIds.size} could not be deleted`,
        )
      } else {
        toast.success(
          `${removed} ${removed === 1 ? 'restaurant' : 'restaurants'} deleted`,
        )
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to delete restaurants'
      toast.error(message)
      void invalidateLists()
    } finally {
      setIsBulkBusy(false)
    }
  }, [selected, clearSelection, updateCurrentPage, invalidateLists])

  const hasSelection = selected.size > 0

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Search */}
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <input
              type="text"
              placeholder="Search by name, slug or domain..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search tenants"
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] pl-10 pr-10 text-sm text-white placeholder:text-white/35 transition-colors focus:border-white/30 focus:outline-none"
            />
            {search ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          {/* Filters + view toggle */}
          <div className="flex flex-wrap items-center gap-2">
            <RangeTabs<TenantStatusFilter>
              value={status}
              onChange={setStatus}
              options={[
                { value: 'all', label: 'All' },
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ]}
            />

            <Select
              value={feature}
              onValueChange={(v) => setFeature(v as TenantFeatureFilter)}
            >
              <SelectTrigger className="h-10 w-[160px] rounded-xl border-white/10 bg-white/[0.03] text-white">
                <SelectValue placeholder="All features" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All features</SelectItem>
                <SelectItem value="menu_engineering">Menu Engineering</SelectItem>
                <SelectItem value="bundles">Bundles</SelectItem>
                <SelectItem value="app">Mobile App</SelectItem>
                <SelectItem value="lalamove">Lalamove</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sort} onValueChange={(v) => setSort(v as TenantSort)}>
              <SelectTrigger className="h-10 w-[140px] rounded-xl border-white/10 bg-white/[0.03] text-white">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Recent</SelectItem>
                <SelectItem value="oldest">Oldest</SelectItem>
                <SelectItem value="name">Name A–Z</SelectItem>
                <SelectItem value="status">Status</SelectItem>
              </SelectContent>
            </Select>

            {/* View toggle (table vs grid) — only meaningful on sm+ */}
            <div className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1 sm:inline-flex">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Table view"
                aria-pressed={view === 'table'}
                onClick={() => changeView('table')}
                className={cn(
                  'h-8 w-8 rounded-full text-white/60 hover:bg-white/10 hover:text-white',
                  view === 'table' && 'bg-white text-black hover:bg-white hover:text-black',
                )}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Grid view"
                aria-pressed={view === 'grid'}
                onClick={() => changeView('grid')}
                className={cn(
                  'h-8 w-8 rounded-full text-white/60 hover:bg-white/10 hover:text-white',
                  view === 'grid' && 'bg-white text-black hover:bg-white hover:text-black',
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Result count line */}
        <div className="flex items-center gap-2 text-sm text-white/45">
          {isLoading ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/40" />
              Searching…
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5 text-white/35" />
              <span className="font-medium text-white/70">{count}</span>
              <span>{count === 1 ? 'restaurant' : 'restaurants'}</span>
              {debouncedSearch ? (
                <span className="text-white/35">matching “{debouncedSearch}”</span>
              ) : null}
            </span>
          )}
        </div>
      </div>

      {loadError ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-2xl border border-red-500/30 bg-red-500/[0.06] px-4 py-3 text-sm text-red-200"
        >
          <span>Couldn’t load restaurants: {loadError}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void retry()}
            className="shrink-0 border-red-400/30 bg-transparent text-red-100 hover:bg-red-500/10"
          >
            Retry
          </Button>
        </div>
      ) : null}

      {/* Results */}
      {tenants.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-16 text-center">
          <Store className="mb-4 h-10 w-10 text-white/20" />
          <p className="text-sm font-medium text-white/60">
            {isLoading
              ? 'Loading restaurants…'
              : debouncedSearch
                ? `No restaurants match “${debouncedSearch}”`
                : 'No restaurants match these filters'}
          </p>
          {!isLoading && debouncedSearch ? (
            <p className="mt-1 text-xs text-white/40">Try a different name, slug or domain.</p>
          ) : null}
        </div>
      ) : (
        <>
          {/* Table view — sm+ only, when toggle === 'table' */}
          {view === 'table' ? (
            <div
              className={cn(
                'hidden overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] transition-opacity sm:block',
                isLoading && 'opacity-50',
              )}
            >
              <div className="flex items-center gap-4 border-b border-white/[0.06] px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-white/35">
                <div
                  className="flex w-5 shrink-0 items-center"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleSelectAll()
                  }}
                >
                  <Checkbox
                    checked={allSelected}
                    aria-label="Select all on this page"
                    className="border-white/20"
                  />
                </div>
                <span className="w-10" />
                <span className="flex-1">Restaurant</span>
                <span className="hidden w-[160px] md:block">Activity</span>
                <span className="hidden lg:block">Features</span>
                <span className="hidden w-[88px] sm:block">Status</span>
                <span className="w-[72px] text-right">Actions</span>
              </div>
              <div className="divide-y divide-white/[0.06]">
                {tenants.map((tenant) => (
                  <TenantTableRow
                    key={tenant.id}
                    tenant={tenant}
                    metrics={metrics[tenant.id]}
                    isMetricsLoading={isMetricsLoading}
                    selected={selected.has(tenant.id)}
                    onToggleSelect={toggleSelect}
                    onDelete={setTenantToDelete}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {/* Grid view — sm+ when toggle === 'grid' */}
          {view === 'grid' ? (
            <div
              className={cn(
                'hidden gap-3 transition-opacity sm:grid sm:grid-cols-2 xl:grid-cols-3',
                isLoading && 'opacity-50',
              )}
            >
              {tenants.map((tenant) => (
                <TenantCard
                  key={tenant.id}
                  tenant={tenant}
                  metrics={metrics[tenant.id]}
                  isMetricsLoading={isMetricsLoading}
                  selected={selected.has(tenant.id)}
                  onToggleSelect={toggleSelect}
                  onDelete={setTenantToDelete}
                />
              ))}
            </div>
          ) : null}

          {/* Mobile: always cards regardless of toggle */}
          <div
            className={cn(
              'grid grid-cols-1 gap-3 transition-opacity sm:hidden',
              isLoading && 'opacity-50',
            )}
          >
            {tenants.map((tenant) => (
              <TenantCard
                key={tenant.id}
                tenant={tenant}
                metrics={metrics[tenant.id]}
                isMetricsLoading={isMetricsLoading}
                selected={selected.has(tenant.id)}
                onToggleSelect={toggleSelect}
                onDelete={setTenantToDelete}
              />
            ))}
          </div>
        </>
      )}

      {/* Pagination */}
      {tenants.length > 0 ? (
        <div className="flex items-center justify-between gap-3 text-sm text-white/45">
          <span className="hidden sm:inline">
            Showing{' '}
            <span className="font-medium text-white/70">
              {rangeStart}–{rangeEnd}
            </span>{' '}
            of <span className="font-medium text-white/70">{count}</span>
          </span>
          <span className="sm:hidden">
            Page {page} / {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isLoading}
              onClick={() => goToPage(page - 1)}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <span className="hidden px-1 text-xs text-white/35 sm:inline">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isLoading}
              onClick={() => goToPage(Math.min(totalPages, page + 1))}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}

      {/* Floating bulk action bar */}
      {hasSelection ? (
        <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-2xl border border-white/10 bg-[#0a0a0a]/95 px-4 py-3 shadow-xl backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-white">
              {selected.size} selected
            </span>
            <Separatorish />
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={isBulkBusy}
                onClick={() => handleBulkSetActive(true)}
                className="border-emerald-400/20 bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20"
              >
                <Power className="mr-1.5 h-4 w-4" />
                Activate
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={isBulkBusy}
                onClick={() => handleBulkSetActive(false)}
                className="border-amber-400/20 bg-amber-400/10 text-amber-400 hover:bg-amber-400/20"
              >
                <PowerOff className="mr-1.5 h-4 w-4" />
                Deactivate
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={isBulkBusy}
                onClick={() => setBulkDeleteOpen(true)}
                className="border-red-400/20 bg-red-400/10 text-red-400 hover:bg-red-400/20"
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Delete
              </Button>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Clear selection"
              disabled={isBulkBusy}
              onClick={clearSelection}
              className="h-8 w-8 text-white/45 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}

      {/* Single-delete confirmation */}
      <AlertDialog
        open={!!tenantToDelete}
        onOpenChange={(open) => !open && setTenantToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete tenant</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{tenantToDelete?.name}</strong>?
              <br />
              <br />
              This will permanently delete:
              <ul className="mt-2 list-inside list-disc space-y-1">
                <li>All menu items and categories</li>
                <li>All orders and order history</li>
                <li>All admin users</li>
                <li>All payment methods and settings</li>
              </ul>
              <br />
              <strong className="text-red-400">This action cannot be undone.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-red-500 text-white hover:bg-red-500/90"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete tenant'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk-delete confirmation */}
      <AlertDialog
        open={bulkDeleteOpen}
        onOpenChange={(open) => {
          if (!isBulkBusy) setBulkDeleteOpen(open)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selected.size}{' '}
              {selected.size === 1 ? 'restaurant' : 'restaurants'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{' '}
              <strong>
                {selected.size} {selected.size === 1 ? 'restaurant' : 'restaurants'}
              </strong>
              ?
              <br />
              <br />
              This will permanently delete, for every selected restaurant:
              <ul className="mt-2 list-inside list-disc space-y-1">
                <li>All menu items and categories</li>
                <li>All orders and order history</li>
                <li>All admin users</li>
                <li>All payment methods and settings</li>
              </ul>
              <br />
              <strong className="text-red-400">This action cannot be undone.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleBulkDelete()
              }}
              disabled={isBulkBusy}
              className="bg-red-500 text-white hover:bg-red-500/90"
            >
              {isBulkBusy ? 'Deleting…' : 'Delete restaurants'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** Thin vertical divider used inside the floating bulk bar. */
function Separatorish() {
  return <span className="h-5 w-px bg-white/10" />
}
