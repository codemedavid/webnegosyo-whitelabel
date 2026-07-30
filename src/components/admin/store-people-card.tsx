'use client'

import { AlertCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MAX_STAFF_PER_TENANT } from '@/lib/staff-permissions'
import type { RosterStaff } from '@/lib/outlets/branch-roster'
import { StaffRoster } from '@/components/admin/staff/staff-roster'
import type { StaffOutlet } from '@/components/admin/staff/staff-fields'

interface StorePeopleCardProps {
  tenantId: string
  tenantSlug: string
  outlets: readonly StaffOutlet[]
  /** Accounts covering every branch. The owner is not among them. */
  storeWideMembers: readonly RosterStaff[]
  /** Accounts pointing at a branch the store no longer has. */
  orphanedMembers: readonly RosterStaff[]
}

/**
 * The accounts that are not any one branch's.
 *
 * A store-wide manager belongs on the index rather than on a branch page,
 * because every branch page would have an equal claim to them and the owner
 * would have to guess which copy is authoritative. Branch teams live on their
 * branch; this card holds the rest.
 *
 * Orphans are surfaced rather than quietly folded in with the store-wide pool.
 * An account pointing at a deleted branch still has a working login, and
 * showing it as store-wide would misstate what it can reach.
 */
export function StorePeopleCard({
  tenantId,
  tenantSlug,
  outlets,
  storeWideMembers,
  orphanedMembers,
}: StorePeopleCardProps) {
  const seatsRemaining = Math.max(0, MAX_STAFF_PER_TENANT - storeWideMembers.length)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Store-wide people</CardTitle>
        <CardDescription>
          Accounts that cover every branch. Staff who run a single branch are managed on that
          branch&apos;s page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <StaffRoster
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          members={storeWideMembers}
          outlets={outlets}
          scopeOutlet={null}
          canMove
          addLabel="Add store-wide account"
          emptyText="No store-wide accounts. Everyone with access is tied to a single branch."
          seatsRemaining={seatsRemaining}
          seatsLabel={`${storeWideMembers.length} of ${MAX_STAFF_PER_TENANT} seats used`}
          seatsTestId="store-people-seats"
        />

        {orphanedMembers.length > 0 && (
          <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
            <p className="flex items-start gap-2 text-sm font-medium text-amber-900">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              Assigned to a branch that no longer exists
            </p>
            <p className="text-sm text-amber-800">
              These accounts can still sign in but see no branch&apos;s orders. Move each of them to
              a branch, or remove them.
            </p>
            <StaffRoster
              tenantId={tenantId}
              tenantSlug={tenantSlug}
              members={orphanedMembers}
              outlets={outlets}
              scopeOutlet={null}
              canMove
              showBranchLabel
              addLabel="Add store-wide account"
              emptyText=""
              // Nothing should be created into this bucket; the add control is
              // the one above. Zero seats disables it without a second prop.
              seatsRemaining={0}
              seatsLabel={`${orphanedMembers.length} to reassign`}
              seatsTestId="store-people-orphans"
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
