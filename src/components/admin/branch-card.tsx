'use client'

import Link from 'next/link'
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  MapPin,
  SlidersHorizontal,
  Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { buildOutletDeepLinkPath } from '@/lib/outlets/deep-link'
import {
  formatOrderCount,
  formatPeso,
  formatShare,
  formatStaffCount,
} from '@/lib/outlets/branch-format'
import type { BranchRosterEntry } from '@/lib/outlets/branch-roster'
import type { Outlet } from '@/types/database'

interface BranchCardProps {
  entry: BranchRosterEntry<Outlet>
  tenantSlug: string
  /** False when this store's takings cannot be compared by branch at all. */
  hasMetrics: boolean
  isFirst: boolean
  isLast: boolean
  onCopyLink: (outlet: Outlet) => void
  onToggleActive: (outlet: Outlet) => void
  onMove: (outletId: string, direction: 'up' | 'down') => void
}

/**
 * One branch, as the owner scans the grid.
 *
 * The card carries only what distinguishes this branch from the one beside it
 * — where it is, what it took, who runs it — and hands everything that needs
 * space to `/admin/outlets/<id>`. The controls that stay are the ones that only
 * make sense against the other cards: reordering, and hiding a branch from
 * customers.
 *
 * A branch with no takings says so in words. Rendering `₱0` would be a claim
 * about a quiet day rather than about a branch that has not opened, and the
 * owner cannot tell those apart from a zero.
 */
export function BranchCard({
  entry,
  tenantSlug,
  hasMetrics,
  isFirst,
  isLast,
  onCopyLink,
  onToggleActive,
  onMove,
}: BranchCardProps) {
  const { outlet, metrics, staffCount } = entry
  const modes = [
    outlet.supports_pickup && 'Pickup',
    outlet.supports_delivery && 'Delivery',
    outlet.supports_dine_in && 'Dine-in',
  ].filter(Boolean) as string[]

  return (
    <Card
      data-testid={`branch-card-${outlet.id}`}
      className={`group relative overflow-hidden transition-shadow hover:shadow-md ${
        outlet.is_active ? '' : 'bg-muted/30'
      }`}
    >
      {/* A quiet status rail beats a status word: the eye finds the closed
          branch without reading any of the cards. */}
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-1 ${
          outlet.is_active ? 'bg-emerald-500' : 'bg-muted-foreground/30'
        }`}
      />

      <CardContent className="space-y-4 py-5 pl-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-semibold leading-tight">{outlet.name}</h3>
              {outlet.is_active ? (
                <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                  Open
                </Badge>
              ) : (
                <Badge variant="secondary">Hidden</Badge>
              )}
            </div>
            {outlet.address ? (
              <p className="flex items-start gap-1.5 truncate text-sm text-muted-foreground">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{outlet.address}</span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No address set</p>
            )}
          </div>

          <div className="flex shrink-0 items-center">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={`Move ${outlet.name} up`}
              disabled={isFirst}
              onClick={() => onMove(outlet.id, 'up')}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={`Move ${outlet.name} down`}
              disabled={isLast}
              onClick={() => onMove(outlet.id, 'down')}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {hasMetrics && (
          <div className="rounded-lg bg-muted/50 px-3 py-2.5">
            {metrics ? (
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="text-xl font-semibold tabular-nums">
                  {formatPeso(metrics.revenue)}
                </span>
                <span className="text-sm text-muted-foreground">
                  {formatOrderCount(metrics.orderCount)}
                </span>
                <span className="text-sm text-muted-foreground">
                  {formatPeso(metrics.averageOrderValue)} avg
                </span>
                <span className="ml-auto text-sm font-medium tabular-nums">
                  {formatShare(metrics.revenueShare)}
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No orders yet</p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="gap-1 font-normal">
            <Users className="h-3 w-3" />
            {formatStaffCount(staffCount)}
          </Badge>
          {modes.map((mode) => (
            <Badge key={mode} variant="outline" className="font-normal">
              {mode}
            </Badge>
          ))}
          {outlet.latitude === null && (
            <Badge variant="outline" className="border-amber-300 font-normal text-amber-700">
              No map pin
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Button asChild size="sm">
            <Link href={`/${tenantSlug}/admin/outlets/${outlet.id}`}>
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              Manage {outlet.name}
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onCopyLink(outlet)}
            title={buildOutletDeepLinkPath(outlet.slug)}
          >
            <Copy className="mr-2 h-4 w-4" />
            Copy link
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => onToggleActive(outlet)}
          >
            {outlet.is_active ? (
              <>
                <EyeOff className="mr-2 h-4 w-4" />
                Hide
              </>
            ) : (
              <>
                <Eye className="mr-2 h-4 w-4" />
                Show
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
