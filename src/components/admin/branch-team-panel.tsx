'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MAX_STAFF_PER_TENANT } from '@/lib/staff-permissions'
import type { StaffRecord } from '@/lib/staff-service'
import { StaffRoster } from '@/components/admin/staff/staff-roster'
import type { StaffOutlet } from '@/components/admin/staff/staff-fields'

interface BranchTeamPanelProps {
  tenantId: string
  tenantSlug: string
  /** The branch whose page this is. */
  outlet: StaffOutlet
  /** Every branch, so a member can be moved to one of the others. */
  outlets: readonly StaffOutlet[]
  /** Accounts posted to this branch. */
  members: readonly StaffRecord[]
  /** Accounts covering the whole store, which reach this branch too. */
  storeWideMembers: readonly StaffRecord[]
}

/**
 * Who runs this branch.
 *
 * Two lists, deliberately. The first is the branch's own team, and it is the
 * only one the seat count applies to — the cap is per branch, so a store-wide
 * manager must not consume a seat at Makati and at BGC at once. The second
 * names the store-wide accounts that can act here anyway: a page that listed
 * only the branch's own staff would let an owner conclude nobody else can touch
 * this branch's orders, which is false.
 */
export function BranchTeamPanel({
  tenantId,
  tenantSlug,
  outlet,
  outlets,
  members,
  storeWideMembers,
}: BranchTeamPanelProps) {
  const seatsRemaining = Math.max(0, MAX_STAFF_PER_TENANT - members.length)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{outlet.name} team</CardTitle>
          <CardDescription>
            These accounts see only {outlet.name}&apos;s orders and sales, on the web admin, the
            merchant app, and the POS.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StaffRoster
            tenantId={tenantId}
            tenantSlug={tenantSlug}
            members={members}
            outlets={outlets}
            scopeOutlet={outlet}
            canMove
            addLabel={`Add to ${outlet.name}`}
            emptyText={`Nobody is posted to ${outlet.name} yet. Add someone to give them access to this branch only.`}
            seatsRemaining={seatsRemaining}
            seatsLabel={`${members.length} of ${MAX_STAFF_PER_TENANT} seats used`}
            seatsTestId="branch-team-seats"
          />
        </CardContent>
      </Card>

      {storeWideMembers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Store-wide access</CardTitle>
            <CardDescription>
              These accounts cover every branch, so they can act on {outlet.name} too. They do not
              use one of this branch&apos;s seats — manage them from the Branches page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {storeWideMembers.map((member) => (
                <li
                  key={member.user_id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 text-sm"
                >
                  <span className="font-medium">
                    {member.display_name || member.email || 'Unnamed account'}
                  </span>
                  <span className="text-muted-foreground">{member.email}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
