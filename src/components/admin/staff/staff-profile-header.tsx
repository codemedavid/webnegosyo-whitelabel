import Link from 'next/link'
import { ArrowLeft, Mail, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/cart-utils'
import { formatClock, formatDayLabel, formatLastActive } from '@/lib/staff-activity/staff-format'
import { toBusinessDayKey } from '@/lib/inventory/business-day'
import type { StaffDirectoryEntry } from '@/lib/staff-activity/staff-profile'
import { STAFF_PERMISSION_LABELS, type StaffPermissionKey } from '@/lib/staff-permissions'
import { StaffAvatar } from './staff-avatar'
import { branchLabel, type StaffOutlet } from '@/lib/outlets/branch-label'

/**
 * Who this is, and whether they are on right now.
 *
 * The right-hand block is the live one: an open drawer is the single most
 * useful fact on the page, and it is stated with the time it opened and the
 * float it started on, because "on shift" alone cannot be acted on. When no
 * drawer is open the same space answers the fallback question — when were
 * they last seen at all.
 */

export interface StaffProfileHeaderProps {
  entry: StaffDirectoryEntry
  outlets: readonly StaffOutlet[]
  backHref: string
  nowMs: number
  nowIso: string
}

export function StaffProfileHeader({
  entry,
  outlets,
  backHref,
  nowMs,
  nowIso,
}: StaffProfileHeaderProps) {
  const permissions = entry.permissions

  return (
    <div className="space-y-4">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        All staff
      </Link>

      <div
        data-testid="staff-profile-header"
        className="relative overflow-hidden rounded-xl border bg-card"
      >
        <span
          aria-hidden
          className={`absolute inset-y-0 left-0 w-1.5 ${entry.openShift ? 'bg-emerald-500' : 'bg-muted-foreground/20'}`}
        />

        <div className="flex flex-col gap-6 p-6 pl-7 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <StaffAvatar name={entry.name} seed={entry.userId} size="lg" />
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-bold leading-tight">{entry.name}</h1>
                {entry.isOwner && <Badge variant="secondary">Owner</Badge>}
                {entry.isFormer && <Badge variant="outline">Former staff</Badge>}
                {outlets.length > 0 && !entry.isFormer && (
                  <Badge variant="secondary">{branchLabel(entry.outletId, outlets)}</Badge>
                )}
              </div>

              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                <span className="truncate">{entry.email ?? 'No email on file'}</span>
              </p>

              {entry.joinedAt && (
                <p className="text-xs text-muted-foreground">
                  Joined {formatDayLabel(toBusinessDayKey(entry.joinedAt), nowIso)}
                </p>
              )}

              <div className="flex flex-wrap gap-1 pt-1">
                {entry.isOwner || permissions === null ? (
                  <Badge variant="outline" className="text-xs">
                    <ShieldCheck className="mr-1 h-3 w-3" />
                    Full access
                  </Badge>
                ) : permissions.length === 0 ? (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    No access granted
                  </Badge>
                ) : (
                  permissions.map((key) => (
                    <Badge key={key} variant="outline" className="text-xs">
                      {STAFF_PERMISSION_LABELS[key as StaffPermissionKey]?.label ?? key}
                    </Badge>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="shrink-0 rounded-lg border bg-muted/30 px-4 py-3 lg:min-w-[220px]">
            {entry.openShift ? (
              <>
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                  <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                  On shift
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Since {formatClock(entry.openShift.openedAt)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Opening float {formatPrice(entry.openShift.openingFloat)}
                </p>
              </>
            ) : (
              <>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Last active</p>
                <p className="mt-1 text-sm font-semibold">
                  {formatLastActive(entry.lastActiveAt, nowMs)}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
