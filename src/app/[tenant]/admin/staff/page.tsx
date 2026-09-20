import { notFound } from 'next/navigation'
import { ClipboardList, Clock, Receipt, Users, Wallet } from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { StaffDirectory } from '@/components/admin/staff/staff-directory'
import { StaffPeriodTabs } from '@/components/admin/staff/staff-period-tabs'
import { StaffStat, StaffStatStrip } from '@/components/admin/staff/staff-stat'
import { getCachedTenantBySlug, getCachedCurrentUserRole } from '@/lib/cache'
import { createClient } from '@/lib/supabase/server'
import { listStaffAction } from '@/app/actions/staff'
import { resolveStaffLimit } from '@/lib/billing/subscription-status'
import { canManageStaff } from '@/lib/staff-permissions'
import { canManageBranchStaff } from '@/lib/outlets/branch-scope'
import { formatPeso } from '@/lib/outlets/branch-format'
import {
  ACTIVITY_PERIOD_LABELS,
  activityWindow,
  parseActivityPeriod,
} from '@/lib/staff-activity/activity-period'
import { loadOrderStatusEvents, loadStaffShifts } from '@/lib/staff-activity/staff-activity-service'
import { buildStaffDirectory, summarizeTeam } from '@/lib/staff-activity/staff-profile'
import { formatShiftLength } from '@/lib/staff-activity/shift-summary'
import type { StaffRecord } from '@/lib/staff-service'

interface StaffPageProps {
  params: Promise<{ tenant: string }>
  searchParams: Promise<{ period?: string }>
}

/**
 * The team.
 *
 * One page answering three questions in order: who works here, who is on the
 * floor right now, and what did each of them do. The roster and the activity
 * log used to be two stacked cards that never referred to each other — a
 * table of names above a table of events — so nobody could get from "Ana" to
 * "Ana's Tuesday" without reading both. Now the roster IS the report: every
 * person is a card carrying their own figures, and their profile behind it
 * holds the day-by-day history and everything that can be changed about them.
 *
 * Read with the same authority as before: the owner sees the store, a branch
 * admin holding `branch_staff` sees their own branch.
 */
export default async function AdminStaffPage({ params, searchParams }: StaffPageProps) {
  const { tenant: tenantSlug } = await params
  const query = await searchParams

  const tenant = await getCachedTenantBySlug(tenantSlug)
  if (!tenant) return <div>Tenant not found</div>

  const caller = await getCachedCurrentUserRole()
  if (!caller) notFound()

  // The owner, or a branch admin for their own branch. Middleware gates the
  // route on `branch_staff`; this is the layer that does not depend on which
  // request path reached the render.
  const isOwner = canManageStaff(caller)
  const branchOutletId = caller.outlet_id ?? null
  const isBranchAdmin = !isOwner && canManageBranchStaff(caller, branchOutletId)
  if (!isOwner && !isBranchAdmin) notFound()

  const period = parseActivityPeriod(query.period)
  const nowMs = Date.now()
  const window = activityWindow(period, nowMs)
  const sinceIso = new Date(window.startMs).toISOString()

  const supabase = await createClient()
  const [staffResult, outletRows, planRow, activity, shifts] = await Promise.all([
    listStaffAction(tenant.id),
    supabase
      .from('outlets')
      .select('id, name')
      .eq('tenant_id', tenant.id)
      .order('sort_order', { ascending: true }),
    supabase.from('tenants').select('max_staff_per_branch').eq('id', tenant.id).maybeSingle(),
    loadOrderStatusEvents(tenant.id, {
      sinceIso,
      // A branch admin reads their branch's events only; the owner reads all.
      outletId: isBranchAdmin ? branchOutletId : undefined,
    }).catch((error: unknown) => {
      console.error('[staff] activity unavailable', error)
      return null
    }),
    loadStaffShifts(tenant.id, { sinceIso }).catch((error: unknown) => {
      console.error('[staff] shifts unavailable', error)
      return [] as Awaited<ReturnType<typeof loadStaffShifts>>
    }),
  ])

  const allStaff: StaffRecord[] = staffResult.success ? staffResult.data : []
  // A branch admin manages their own branch's people, plus the store-wide
  // accounts that also work there. Anyone else's account is not theirs to see.
  const staff = isBranchAdmin
    ? allStaff.filter((member) => (member.outlet_id ?? null) === branchOutletId)
    : allStaff
  const outlets = (outletRows.data as { id: string; name: string }[] | null) ?? []
  const visibleShifts = isBranchAdmin
    ? shifts.filter((shift) => shift.outletId === branchOutletId)
    : shifts

  const entries = buildStaffDirectory({
    members: staff,
    events: activity?.events ?? [],
    shifts: visibleShifts,
    window,
    nowMs,
  })
  const stats = summarizeTeam(entries)

  const seatLimit = resolveStaffLimit({
    max_staff_per_branch:
      (planRow.data as { max_staff_per_branch?: number | null } | null)?.max_staff_per_branch ?? null,
  })
  const seatsUsed = entries.filter((entry) => !entry.isFormer && !entry.isOwner).length
  const basePath = `/${tenantSlug}/admin/staff`

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Dashboard', href: `/${tenantSlug}/admin` }, { label: 'Staff' }]} />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Staff</h1>
          <p className="text-muted-foreground">
            Your team, what each person can do, and the orders and shifts they handled.
          </p>
        </div>
        <StaffPeriodTabs basePath={basePath} period={period} />
      </div>

      <StaffStatStrip>
        <StaffStat
          testId="staff-stat-headcount"
          label="Team"
          value={String(stats.headcount)}
          icon={<Users className="h-4 w-4" />}
          hint={`${seatsUsed} of ${seatLimit} seats used`}
        />
        <StaffStat
          testId="staff-stat-on-shift"
          label="On shift now"
          value={String(stats.onShift)}
          icon={<Clock className="h-4 w-4" />}
          tone={stats.onShift > 0 ? 'positive' : 'default'}
          hint={stats.onShift === 0 ? 'No drawer open' : 'Drawer open on the register'}
        />
        <StaffStat
          testId="staff-stat-rang-up"
          label="Rang up"
          value={formatPeso(stats.posSalesTotal)}
          icon={<Receipt className="h-4 w-4" />}
          hint={`${stats.posSales} counter sales · ${ACTIVITY_PERIOD_LABELS[period].toLowerCase()}`}
        />
        <StaffStat
          testId="staff-stat-handled"
          label="Orders handled"
          value={String(stats.ordersHandled)}
          icon={<ClipboardList className="h-4 w-4" />}
          hint={stats.cancelled === 0 ? 'None cancelled' : `${stats.cancelled} cancelled`}
          tone={stats.cancelled > 0 ? 'warning' : 'default'}
        />
        <StaffStat
          testId="staff-stat-variance"
          label="Drawer variance"
          value={stats.netVariance === null ? '—' : formatPeso(stats.netVariance)}
          icon={<Wallet className="h-4 w-4" />}
          tone={stats.netVariance !== null && stats.netVariance !== 0 ? 'warning' : 'default'}
          hint={
            stats.netVariance === null
              ? 'No drawer counted yet'
              : `${formatShiftLength(stats.workedMs)} on the floor`
          }
        />
      </StaffStatStrip>

      {activity === null && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium">We couldn&apos;t load staff activity.</p>
          <p className="mt-1 text-muted-foreground">
            The roster below is still accurate; the order figures may be missing. Please refresh, and
            contact support if it keeps happening.
          </p>
        </div>
      )}

      <StaffDirectory
        basePath={basePath}
        tenantId={tenant.id}
        tenantSlug={tenantSlug}
        entries={entries}
        outlets={outlets}
        seatLimit={seatLimit}
        seatsRemaining={Math.max(0, seatLimit - seatsUsed)}
        nowMs={nowMs}
        period={period}
      />
    </div>
  )
}
