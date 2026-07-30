'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { OutletForm } from '@/components/admin/outlet-form'
import { BranchTeamPanel } from '@/components/admin/branch-team-panel'
import { updateOutletAction } from '@/app/actions/outlets'
import { buildOutletDeepLinkPath, buildOutletShareUrl } from '@/lib/outlets/deep-link'
import {
  formatOrderCount,
  formatPeso,
  formatShare,
} from '@/lib/outlets/branch-format'
import type { BranchComparisonRow } from '@/lib/outlets/branch-analytics'
import type { RosterStaff } from '@/lib/outlets/branch-roster'
import type { StaffOutlet } from '@/components/admin/staff/staff-fields'
import type { Outlet } from '@/types/database'

interface BranchDetailProps {
  tenantId: string
  tenantSlug: string
  outlet: Outlet
  mapboxEnabled?: boolean
  outlets: readonly StaffOutlet[]
  members: readonly RosterStaff[]
  storeWideMembers: readonly RosterStaff[]
  /** Null when the branch has no takings, or they cannot be read. */
  metrics: BranchComparisonRow | null
  /** False when this store's takings cannot be split by branch at all. */
  hasMetrics: boolean
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/**
 * One branch, in full.
 *
 * Three tabs because the owner arrives with one of three intents — how is it
 * doing, who is running it, is its setup right — and a single scrolling page
 * makes them compete. The branch's identity (name, status, link) sits above the
 * tabs, so it never scrolls away and the owner cannot act on the wrong branch.
 */
export function BranchDetail({
  tenantId,
  tenantSlug,
  outlet: initialOutlet,
  mapboxEnabled = false,
  outlets,
  members,
  storeWideMembers,
  metrics,
  hasMetrics,
}: BranchDetailProps) {
  const router = useRouter()
  const [outlet, setOutlet] = useState(initialOutlet)
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async (input: Parameters<typeof updateOutletAction>[3]) => {
    setIsSaving(true)
    const result = await updateOutletAction(tenantId, tenantSlug, outlet.id, input)
    setIsSaving(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }
    setOutlet(result.data)
    toast.success(`${result.data.name} saved`)
    router.refresh()
  }

  const handleCopyLink = async () => {
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
      toast.info(url, { description: 'Copy this branch link manually.' })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold">{outlet.name}</h1>
            {outlet.is_active ? (
              <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Open</Badge>
            ) : (
              <Badge variant="secondary">Hidden</Badge>
            )}
          </div>
          <p className="text-muted-foreground">{outlet.address ?? 'No address set'}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleCopyLink}>
            <Copy className="mr-2 h-4 w-4" />
            Copy link
          </Button>
          <Button asChild variant="outline" size="sm">
            <a
              href={buildOutletDeepLinkPath(outlet.slug)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              View as customer
            </a>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          {!hasMetrics ? (
            <p className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
              Branch takings are available for stores whose orders are on the platform database.
              This store uses a different order backend.
            </p>
          ) : metrics ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Revenue" value={formatPeso(metrics.revenue)} hint="Cancellations excluded" />
              <Metric label="Orders" value={String(metrics.orderCount)} hint={formatOrderCount(metrics.orderCount)} />
              <Metric label="Average order" value={formatPeso(metrics.averageOrderValue)} />
              <Metric label="Share of store" value={formatShare(metrics.revenueShare)} hint="By revenue" />
            </div>
          ) : (
            <p className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
              No orders yet. Once {outlet.name} starts taking orders, its takings appear here.
            </p>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">How customers reach this branch</CardTitle>
              <CardDescription>
                Print this link or its QR code in store. It opens your menu with {outlet.name}
                {' '}already chosen.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <code className="block truncate rounded-md bg-muted px-3 py-2 font-mono text-sm">
                {buildOutletDeepLinkPath(outlet.slug)}
              </code>
              <div className="flex flex-wrap gap-1.5">
                {outlet.supports_pickup && <Badge variant="outline">Pickup</Badge>}
                {outlet.supports_delivery && <Badge variant="outline">Delivery</Badge>}
                {outlet.supports_dine_in && <Badge variant="outline">Dine-in</Badge>}
                {outlet.latitude === null && (
                  <Badge variant="outline" className="border-amber-300 text-amber-700">
                    No map pin — cannot be matched to a customer&apos;s location
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="team" className="mt-4">
          <BranchTeamPanel
            tenantId={tenantId}
            tenantSlug={tenantSlug}
            outlet={{ id: outlet.id, name: outlet.name }}
            outlets={outlets}
            members={members}
            storeWideMembers={storeWideMembers}
          />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <OutletForm
            outlet={outlet}
            mapboxEnabled={mapboxEnabled}
            isSaving={isSaving}
            onCancel={() => router.push(`/${tenantSlug}/admin/outlets`)}
            onSubmit={handleSave}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
