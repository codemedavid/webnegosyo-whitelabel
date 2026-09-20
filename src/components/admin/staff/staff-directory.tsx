'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, Search, UserPlus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatPeso } from '@/lib/outlets/branch-format'
import { formatLastActive } from '@/lib/staff-activity/staff-format'
import { formatShiftLength } from '@/lib/staff-activity/shift-summary'
import { activityCount, type StaffDirectoryEntry } from '@/lib/staff-activity/staff-profile'
import { STAFF_PERMISSION_LABELS, type StaffPermissionKey } from '@/lib/staff-permissions'
import { StaffAvatar } from './staff-avatar'
import { AddStaffDialog } from './add-staff-dialog'
import { branchLabel, type StaffOutlet } from './staff-fields'

/**
 * The team, as a set of people you can walk up to.
 *
 * A table would rank them; this grid introduces them. Each card carries the
 * three things an owner actually checks — is this person on right now, what
 * did they ring, when were they last seen — and hands everything else to the
 * profile behind it. Management lives there too: a card that could fire
 * someone is a card you cannot scan.
 *
 * Former staff are filtered out by default and reachable by a toggle rather
 * than deleted from the view: their takings are still in last month's
 * figures, so the page has to be able to explain them.
 */

export interface StaffDirectoryProps {
  basePath: string
  tenantId: string
  tenantSlug: string
  entries: readonly StaffDirectoryEntry[]
  outlets: readonly StaffOutlet[]
  seatLimit: number
  seatsRemaining: number
  /** Passed in so the card's "last seen" cannot drift from the page's window. */
  nowMs: number
  /** The period to carry into each profile link. */
  period?: string
}

function matches(entry: StaffDirectoryEntry, query: string): boolean {
  if (query === '') return true
  const needle = query.toLowerCase()
  return (
    entry.name.toLowerCase().includes(needle) ||
    (entry.email ?? '').toLowerCase().includes(needle)
  )
}

function permissionSummary(entry: StaffDirectoryEntry): string {
  if (entry.isOwner || entry.permissions === null) return 'Full access'
  if (entry.permissions.length === 0) return 'No access yet'
  if (entry.permissions.length <= 2) {
    return entry.permissions
      .map((key) => STAFF_PERMISSION_LABELS[key as StaffPermissionKey]?.label ?? key)
      .join(' · ')
  }
  return `${entry.permissions.length} areas`
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold tabular-nums">{value}</p>
      <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  )
}

function StaffCard({
  entry,
  href,
  outlets,
  showBranch,
  nowMs,
}: {
  entry: StaffDirectoryEntry
  href: string
  outlets: readonly StaffOutlet[]
  showBranch: boolean
  nowMs: number
}) {
  const isOnShift = entry.openShift !== null

  return (
    <div
      data-testid={`staff-card-${entry.userId}`}
      className="group relative overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md"
    >
      {/* The same quiet status rail the branch cards use: the eye finds who is
          on the floor without reading a single card. */}
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-1 ${isOnShift ? 'bg-emerald-500' : 'bg-transparent'}`}
      />

      <div className="space-y-4 p-5 pl-6">
        <div className="flex items-start gap-3">
          <StaffAvatar name={entry.name} seed={entry.userId} />
          <div className="min-w-0 flex-1">
            <Link
              href={href}
              className="block truncate font-semibold leading-tight underline-offset-4 outline-none hover:underline focus-visible:underline"
            >
              {entry.name}
              <span className="absolute inset-0" aria-hidden />
            </Link>
            <p className="truncate text-sm text-muted-foreground">{entry.email ?? 'No email on file'}</p>
          </div>
          <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </div>

        <div className="flex flex-wrap gap-1">
          {isOnShift && (
            <Badge className="border-transparent bg-emerald-100 text-xs text-emerald-700 hover:bg-emerald-100">
              On shift
            </Badge>
          )}
          {entry.isOwner && (
            <Badge variant="secondary" className="text-xs">
              Owner
            </Badge>
          )}
          {entry.isFormer && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              Former
            </Badge>
          )}
          {!entry.isFormer && (
            <Badge variant="outline" className="text-xs">
              {permissionSummary(entry)}
            </Badge>
          )}
          {showBranch && !entry.isFormer && (
            <Badge variant="secondary" className="text-xs">
              {branchLabel(entry.outletId, outlets)}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 border-t pt-3">
          <Figure label="Rang up" value={formatPeso(entry.activity.posSalesTotal)} />
          <Figure label="Orders" value={String(activityCount(entry.activity))} />
          <Figure
            label="On the floor"
            value={entry.shifts.count === 0 ? '—' : formatShiftLength(entry.shifts.workedMs)}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          {isOnShift ? 'On the counter now' : formatLastActive(entry.lastActiveAt, nowMs)}
        </p>
      </div>
    </div>
  )
}

export function StaffDirectory({
  basePath,
  tenantId,
  tenantSlug,
  entries,
  outlets,
  seatLimit,
  seatsRemaining,
  nowMs,
  period = '7d',
}: StaffDirectoryProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [showFormer, setShowFormer] = useState(false)

  const formerCount = entries.filter((entry) => entry.isFormer).length
  const visible = useMemo(
    () => entries.filter((entry) => entry.isFormer === showFormer && matches(entry, query)),
    [entries, showFormer, query],
  )
  // Seats are what the plan sells, and the owner's login is not one of them —
  // the same rule `countStaffInBranch` applies server-side.
  const rosterCount = entries.filter((entry) => !entry.isFormer && !entry.isOwner).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search staff"
            placeholder="Search by name or email"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-9"
          />
        </div>

        {formerCount > 0 && (
          <Button
            variant={showFormer ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setShowFormer((current) => !current)}
          >
            Past staff ({formerCount})
          </Button>
        )}

        <Badge data-testid="staff-seats" variant="secondary" className="font-normal">
          {rosterCount} of {seatLimit} staff
        </Badge>

        <Button size="sm" onClick={() => setIsAddOpen(true)} disabled={seatsRemaining <= 0}>
          <UserPlus className="mr-2 h-4 w-4" />
          Add staff member
        </Button>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          {query !== ''
            ? 'No one matches that search.'
            : showFormer
              ? 'Nobody has left this store yet.'
              : `No staff accounts yet. Add up to ${seatLimit} team members.`}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((entry) => (
            <StaffCard
              key={entry.userId}
              entry={entry}
              href={`${basePath}/${entry.userId}?period=${period}`}
              outlets={outlets}
              showBranch={outlets.length > 0}
              nowMs={nowMs}
            />
          ))}
        </div>
      )}

      {seatsRemaining <= 0 && !showFormer && (
        <p className="text-xs text-muted-foreground">
          Seat limit reached. Remove or move a member to add someone new.
        </p>
      )}

      <AddStaffDialog
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        outlets={outlets}
        scopeOutlet={null}
        onCreated={() => router.refresh()}
      />
    </div>
  )
}
