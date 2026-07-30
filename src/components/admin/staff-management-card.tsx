'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MAX_STAFF_PER_TENANT } from '@/lib/staff-permissions'
import type { RosterStaff } from '@/lib/outlets/branch-roster'
import { StaffRoster } from '@/components/admin/staff/staff-roster'
import type { StaffOutlet } from '@/components/admin/staff/staff-fields'

interface StaffManagementCardProps {
  tenantId: string
  tenantSlug: string
  staff: readonly RosterStaff[]
  /**
   * The store's branches. Empty (the default) for every single-location
   * tenant, which is the signal to render the card without any branch control
   * and without a branch column.
   */
  outlets?: readonly StaffOutlet[]
}

/**
 * Staff management in Settings.
 *
 * This is the whole surface for a single-location store, which has no Branches
 * page to hold a team — `/admin/outlets` 404s while the multi-branch flag is
 * off, so removing this card would have left those tenants unable to manage
 * anyone at all.
 *
 * A multi-branch store sees it too, and it stays honest there because it and
 * the branch pages render the same `StaffRoster` over the same server actions:
 * a member added here appears on their branch's page, with the same
 * permissions, counted against the same seats.
 */
export function StaffManagementCard({
  tenantId,
  tenantSlug,
  staff,
  outlets = [],
}: StaffManagementCardProps) {
  const members = staff.filter((member) => !member.is_owner)
  const seatsRemaining = Math.max(0, MAX_STAFF_PER_TENANT - members.length)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Staff &amp; Permissions</CardTitle>
        <CardDescription>
          Give your team access to only the features they need — on the web admin, the merchant
          app, and the POS.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <StaffRoster
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          members={members}
          outlets={outlets}
          scopeOutlet={null}
          showBranchLabel={outlets.length > 0}
          addLabel="Add staff member"
          emptyText={`No staff accounts yet. Add up to ${MAX_STAFF_PER_TENANT} team members.`}
          seatsRemaining={seatsRemaining}
          seatsLabel={`${members.length} of ${MAX_STAFF_PER_TENANT} staff`}
          seatsTestId="settings-staff-seats"
        />
      </CardContent>
    </Card>
  )
}
