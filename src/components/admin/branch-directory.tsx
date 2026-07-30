'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { createOutletAction, reorderOutletsAction, setOutletActiveAction } from '@/app/actions/outlets'
import { OutletForm } from '@/components/admin/outlet-form'
import { BranchCard } from '@/components/admin/branch-card'
import { BranchSummaryStrip } from '@/components/admin/branch-summary-strip'
import { moveOutletOrder } from '@/lib/outlets/outlet-form'
import { buildOutletDeepLinkPath, buildOutletShareUrl } from '@/lib/outlets/deep-link'
import { buildBranchRoster, type RosterStaff } from '@/lib/outlets/branch-roster'
import type { AnalyticsOrderLike } from '@/lib/outlets/branch-analytics'
import type { Outlet } from '@/types/database'

interface BranchDirectoryProps {
  tenantId: string
  tenantSlug: string
  /** Tenant flag: when off the address field falls back to plain text entry. */
  mapboxEnabled?: boolean
  initialOutlets: Outlet[]
  /** Every admin account on the store, owner included; the roster filters it. */
  staff: readonly RosterStaff[]
  /** Null when this store's takings cannot be compared by branch. */
  orders: readonly AnalyticsOrderLike[] | null
}

/**
 * The Branches index.
 *
 * Editing a branch is no longer here — it moved to the branch's own page, next
 * to that branch's team and its numbers, because editing an outlet in a form
 * that replaced the whole list meant losing sight of everything you were
 * comparing it against. What stays are the actions that are about the *set* of
 * branches: adding one, reordering them, and hiding one from customers.
 */
export function BranchDirectory({
  tenantId,
  tenantSlug,
  mapboxEnabled = false,
  initialOutlets,
  staff,
  orders,
}: BranchDirectoryProps) {
  const router = useRouter()
  const [outlets, setOutlets] = useState<Outlet[]>(initialOutlets)
  const [isCreating, setIsCreating] = useState(false)
  const [isBusy, setIsBusy] = useState(false)

  const roster = useMemo(
    () => buildBranchRoster({ outlets, staff, orders }),
    [outlets, staff, orders]
  )

  const handleCreate = async (input: Parameters<typeof createOutletAction>[2]) => {
    setIsBusy(true)
    const result = await createOutletAction(tenantId, tenantSlug, {
      ...input,
      sort_order: outlets.length,
    })
    setIsBusy(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }
    setOutlets([...outlets, result.data])
    setIsCreating(false)
    toast.success(`${result.data.name} added`)
    router.refresh()
  }

  const handleToggleActive = async (outlet: Outlet) => {
    const nextActive = !outlet.is_active
    const result = await setOutletActiveAction(tenantId, tenantSlug, outlet.id, nextActive)

    if (!result.success) {
      toast.error(result.error)
      return
    }
    setOutlets(outlets.map((row) => (row.id === outlet.id ? result.data : row)))
    toast.success(nextActive ? `${outlet.name} is open to customers` : `${outlet.name} hidden`)
    router.refresh()
  }

  /**
   * Hands the merchant the link they will print. Built from the same helper the
   * route uses, and copied as an absolute URL because a QR code cannot be
   * relative.
   */
  const handleCopyLink = async (outlet: Outlet) => {
    const url =
      typeof window === 'undefined'
        ? buildOutletDeepLinkPath(outlet.slug)
        : buildOutletShareUrl({
            origin: window.location.origin,
            pathname: window.location.pathname,
            tenantSlug,
            slug: outlet.slug,
          })
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Branch link copied')
    } catch {
      // Clipboard access is refused in some browsers and over plain HTTP.
      toast.info(url, { description: 'Copy this branch link manually.' })
    }
  }

  const handleMove = async (outletId: string, direction: 'up' | 'down') => {
    const orderedIds = moveOutletOrder(
      outlets.map((outlet) => outlet.id),
      outletId,
      direction
    )
    // Reorder is a no-op at the ends; skip the round trip rather than writing
    // the same order back.
    if (orderedIds.every((id, index) => id === outlets[index]?.id)) return

    const reordered = orderedIds.map(
      (id, index) => ({ ...outlets.find((outlet) => outlet.id === id)!, sort_order: index })
    )
    setOutlets(reordered)

    const result = await reorderOutletsAction(tenantId, tenantSlug, orderedIds)
    if (!result.success) {
      setOutlets(outlets) // put the old order back; the save did not happen
      toast.error(result.error)
      return
    }
    router.refresh()
  }

  if (isCreating) {
    return (
      <OutletForm
        mapboxEnabled={mapboxEnabled}
        outlet={null}
        isSaving={isBusy}
        onCancel={() => setIsCreating(false)}
        onSubmit={handleCreate}
      />
    )
  }

  return (
    <div className="space-y-5">
      {outlets.length > 0 && <BranchSummaryStrip roster={roster} />}

      {!roster.hasMetrics && (
        <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          Branch takings are available for stores whose orders are on the platform database. This
          store uses a different order backend, so the figures below are limited to setup and staff.
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {outlets.length === 0 ? 'Your branches' : `Your branches (${outlets.length})`}
        </h2>
        <Button onClick={() => setIsCreating(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add branch
        </Button>
      </div>

      {outlets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <MapPin className="mx-auto mb-3 h-8 w-8 opacity-50" />
            <p className="font-medium text-foreground">No branches yet</p>
            <p className="mx-auto max-w-md text-sm">
              Until you add two or more active branches, customers see your menu exactly as they do
              today — no branch picker.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {roster.branches.map((entry, index) => (
            <BranchCard
              key={entry.outlet.id}
              entry={entry}
              tenantSlug={tenantSlug}
              hasMetrics={roster.hasMetrics}
              isFirst={index === 0}
              isLast={index === roster.branches.length - 1}
              onCopyLink={handleCopyLink}
              onToggleActive={handleToggleActive}
              onMove={handleMove}
            />
          ))}
        </div>
      )}
    </div>
  )
}
