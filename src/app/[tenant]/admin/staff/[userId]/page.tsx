import { notFound } from 'next/navigation'
import { Clock, Receipt, ShoppingBag, Wallet, XCircle } from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { StaffAccessCard } from '@/components/admin/staff/staff-access-card'
import { StaffDayHistory } from '@/components/admin/staff/staff-day-history'
import { StaffPeriodTabs } from '@/components/admin/staff/staff-period-tabs'
import { StaffProfileHeader } from '@/components/admin/staff/staff-profile-header'
import { StaffShiftHistory } from '@/components/admin/staff/staff-shift-history'
import { StaffStat, StaffStatStrip } from '@/components/admin/staff/staff-stat'
import { listStaffAction } from '@/app/actions/staff'
import { getCachedTenantBySlug, getCachedCurrentUserRole } from '@/lib/cache'
import { createClient } from '@/lib/supabase/server'
import { canManageStaff } from '@/lib/staff-permissions'
import { canManageBranchStaff } from '@/lib/outlets/branch-scope'
import { formatPeso } from '@/lib/outlets/branch-format'
import { activityWindow, parseActivityPeriod } from '@/lib/staff-activity/activity-period'
import { loadOrderStatusEvents, loadStaffShifts } from '@/lib/staff-activity/staff-activity-service'
import { buildStaffDirectory, groupActivityByDay } from '@/lib/staff-activity/staff-profile'
import { formatShiftLength } from '@/lib/staff-activity/shift-summary'
import type { StaffRecord } from '@/lib/staff-service'

interface StaffProfilePageProps {
  params: Promise<{ tenant: string; userId: string }>
  searchParams: Promise<{ period?: string }>
}

/**
 * One person.
 *
 * Everything the store knows about a colleague on a single page: who they
 * are, whether they are on the counter right now, what they rang up and
 * handled day by day, every drawer they held and how it reconciled — and,
 * last, the controls that change any of it.
 *
 * Order is the argument. Management sits below the record because the
 * question that brings an owner here ("what happened on Tuesday?") almost
 * never ends in a permission change, and putting the Remove button at the
 * top of someone's history is a UI that makes firing them the default act.
 *
 * Someone who has left the roster still has a page: their events and shifts
 * are attributed history, not orphans. They get the record, without the
 * controls — there is no account left to change.
 */
export default async function StaffProfilePage({ params, searchParams }: StaffProfilePageProps) {
  const { tenant: tenantSlug, userId } = await params
  const query = await searchParams

  const tenant = await getCachedTenantBySlug(tenantSlug)
  if (!tenant) return <div>Tenant not found</div>

  const caller = await getCachedCurrentUserRole()
  if (!caller) notFound()

  const isOwner = canManageStaff(caller)
  const branchOutletId = caller.outlet_id ?? null
  const isBranchAdmin = !isOwner && canManageBranchStaff(caller, branchOutletId)
  if (!isOwner && !isBranchAdmin) notFound()

  const period = parseActivityPeriod(query.period)
  const nowMs = Date.now()
  const nowIso = new Date(nowMs).toISOString()
  const window = activityWindow(period, nowMs)
  const sinceIso = new Date(window.startMs).toISOString()

  const supabase = await createClient()
  const [staffResult, outletRows, activity, shifts] = await Promise.all([
    listStaffAction(tenant.id),
    supabase
      .from('outlets')
      .select('id, name')
      .eq('tenant_id', tenant.id)
      .order('sort_order', { ascending: true }),
    loadOrderStatusEvents(tenant.id, {
      sinceIso,
      actorUserId: userId,
      // A branch admin reads their branch's events only, here as on the list.
      outletId: isBranchAdmin ? branchOutletId : undefined,
    }).catch((error: unknown) => {
      console.error('[staff] activity unavailable', error)
      return null
    }),
    loadStaffShifts(tenant.id, { sinceIso, staffUserId: userId }).catch((error: unknown) => {
      console.error('[staff] shifts unavailable', error)
      return [] as Awaited<ReturnType<typeof loadStaffShifts>>
    }),
  ])

  const roster: StaffRecord[] = staffResult.success ? staffResult.data : []
  // The shift loader has no branch filter — it is a per-person read — so the
  // branch narrowing happens here rather than being silently skipped.
  const visibleShifts = isBranchAdmin
    ? shifts.filter((shift) => shift.outletId === branchOutletId)
    : shifts
  const member = roster.find((record) => record.user_id === userId) ?? null
  const outlets = (outletRows.data as { id: string; name: string }[] | null) ?? []

  // A branch admin reads their own branch's people. A former account has no
  // branch left to check, so it is the owner's to read.
  if (isBranchAdmin) {
    const targetOutletId = member?.outlet_id ?? visibleShifts[0]?.outletId ?? null
    if (!canManageBranchStaff(caller, targetOutletId)) notFound()
  }

  // The directory builder is what knows how to make a person out of a roster
  // row, an activity summary and a pile of shifts — including the case where
  // the roster row is gone. Reusing it here is what keeps a figure on this
  // page identical to the same figure on the card that linked to it.
  const [entry] = buildStaffDirectory({
    members: member ? [member] : [],
    events: activity?.events ?? [],
    shifts: visibleShifts,
    window,
    nowMs,
  })

  // Neither an account nor a trace of one: this id is not a person here.
  if (!entry) notFound()

  const days = groupActivityByDay(activity?.events ?? [], visibleShifts)
  const basePath = `/${tenantSlug}/admin/staff`
  const { activity: summary, shifts: shiftTotals } = entry

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: `/${tenantSlug}/admin` },
          { label: 'Staff', href: basePath },
          { label: entry.name },
        ]}
      />

      <StaffProfileHeader
        entry={entry}
        outlets={outlets}
        backHref={`${basePath}?period=${period}`}
        nowMs={nowMs}
        nowIso={nowIso}
      />

      <div className="flex justify-end">
        <StaffPeriodTabs basePath={`${basePath}/${userId}`} period={period} />
      </div>

      <StaffStatStrip>
        <StaffStat
          testId="profile-stat-rang-up"
          label="Rang up"
          value={formatPeso(summary.posSalesTotal)}
          icon={<Receipt className="h-4 w-4" />}
          hint={`${summary.posSales} counter sales`}
        />
        <StaffStat
          testId="profile-stat-confirmed"
          label="Confirmed"
          value={String(summary.confirmed)}
          icon={<ShoppingBag className="h-4 w-4" />}
          hint={`${formatPeso(summary.confirmedTotal)} of web orders`}
        />
        <StaffStat
          testId="profile-stat-completed"
          label="Completed"
          value={String(summary.completed)}
          icon={<ShoppingBag className="h-4 w-4" />}
          hint={summary.progressed === 0 ? 'Handed to the customer' : `${summary.progressed} moved along`}
        />
        <StaffStat
          testId="profile-stat-cancelled"
          label="Cancelled"
          value={String(summary.cancelled)}
          icon={<XCircle className="h-4 w-4" />}
          tone={summary.cancelled > 0 ? 'warning' : 'default'}
          hint={summary.cancelled === 0 ? 'None in this period' : 'Worth a look'}
        />
        <StaffStat
          testId="profile-stat-shifts"
          label="Shifts"
          value={String(shiftTotals.count)}
          icon={<Clock className="h-4 w-4" />}
          hint={
            shiftTotals.count === 0
              ? 'No drawer opened'
              : `${formatShiftLength(shiftTotals.workedMs)} on the floor`
          }
        />
      </StaffStatStrip>

      {activity === null && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium">We couldn&apos;t load this person&apos;s order activity.</p>
          <p className="mt-1 text-muted-foreground">
            Shifts and account details below are still accurate. Please refresh, and contact support
            if it keeps happening.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Day by day</CardTitle>
            <CardDescription>
              Every order they rang up, confirmed, completed or cancelled, grouped by trading day.
              Web orders count as work done, never as drawer cash.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StaffDayHistory
              days={days}
              nowIso={nowIso}
              nowMs={nowMs}
              isTruncated={activity?.isTruncated ?? false}
            />
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Shifts</CardTitle>
            <CardDescription>
              {shiftTotals.countedCount === 0
                ? 'Drawers this person held.'
                : shiftTotals.netVariance === 0
                  ? 'Every counted drawer balanced.'
                  : `Net ${formatPeso(Math.abs(shiftTotals.netVariance ?? 0))} ${
                      (shiftTotals.netVariance ?? 0) < 0 ? 'short' : 'over'
                    } across ${shiftTotals.countedCount} counted ${
                      shiftTotals.countedCount === 1 ? 'drawer' : 'drawers'
                    }.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StaffShiftHistory shifts={visibleShifts} nowMs={nowMs} nowIso={nowIso} outlets={outlets} />
          </CardContent>
        </Card>
      </div>

      {member && !member.is_owner && (
        <Card>
          <CardHeader>
            <CardTitle>Account &amp; access</CardTitle>
            <CardDescription>
              What this person can reach on the web admin, the merchant app and the POS.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StaffAccessCard
              tenantId={tenant.id}
              tenantSlug={tenantSlug}
              userId={userId}
              name={entry.name}
              permissions={member.permissions}
              outletId={member.outlet_id ?? null}
              defaultTab={member.default_tab ?? null}
              outlets={outlets}
              afterRemoveHref={basePath}
            />
          </CardContent>
        </Card>
      )}

      {member?.is_owner && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            <Wallet className="mb-2 h-4 w-4" />
            This is the owner account. Its password and details are changed from Settings, and its
            access cannot be limited.
          </CardContent>
        </Card>
      )}

      {!member && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            This account has been removed from the store. Their record is kept so past orders and
            shifts stay attributable.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
