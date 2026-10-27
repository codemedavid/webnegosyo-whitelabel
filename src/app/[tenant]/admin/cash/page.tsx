import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getRequestCaller } from '@/lib/auth/request-caller'
import { readCutoffScheduleForDisplay } from '@/lib/business-day/read-schedule'
import { getCachedTenantBySlug } from '@/lib/cache'
import { buildCashPage, type CashOutlet } from '@/lib/cash/cash-page'
import { resolveOrderBackend } from '@/lib/order-backend'
import { isMultiBranchEnabled } from '@/lib/outlets/multi-branch-flag'
import { createClient } from '@/lib/supabase/server'
import { KpiRowSkeleton, TableSkeleton } from '@/components/admin/reports'
import { SCHEDULE_FALLBACK_NOTE } from '@/lib/reports/schedule-fallback-note'
import { CashHeader, CashTabs } from '@/components/admin/cash/cash-header'
import { CashLoadFailed, CashLocked, CashNotice } from '@/components/admin/cash/cash-states'
import { listRemittances } from '@/lib/cash/remittances'
import { CashAcceptSection } from './cash-accept-section'
import { CashSettingsSection } from './cash-settings-section'
import { CashShiftsSection } from './cash-shifts-section'

interface CashPageProps {
  params: Promise<{ tenant: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const PAGE_TITLE = <h1 className="text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] text-wn-ink md:text-[30px]">Cash &amp; remits</h1>

/** The store's branches as the caller may read them. A failed read is surfaced, never "no branches". */
async function readOutlets(db: SupabaseClient, tenantId: string): Promise<CashOutlet[]> {
  const { data, error } = await db
    .from('outlets')
    .select('id, name, is_active')
    .eq('tenant_id', tenantId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw new Error(`Could not read the store's branches: ${error.message}`)
  return ((data ?? []) as Array<{ id: string; name: string; is_active: boolean | null }>).map((row) => ({
    id: row.id,
    name: row.name,
    isActive: row.is_active === true,
  }))
}

/** Waiting remittances, for the "To accept (N)" badge. Advisory: null hides the badge. */
async function readWaitingCount(db: SupabaseClient, tenantId: string, outletId: string | null): Promise<number | null> {
  try {
    const waiting = await listRemittances(db, { tenantId, statuses: ['pending'], businessDay: null, outletId })
    return waiting.length
  } catch (error) {
    console.error('[cash] waiting count unavailable', error instanceof Error ? error.message : error)
    return null
  }
}

/**
 * "Cash & remits" (CONTRACTS §8, UX §4.7). Gated by the `cash` section →
 * `cash_manage` in the middleware AND here (fail closed). Every read goes
 * through the caller's own session client, so RLS decides what comes back.
 * Shifts live in the platform database for every store; their SALES do only
 * on platform-backend stores (`report_shift_sales` says "unavailable"
 * otherwise and the page says so).
 */
export default async function CashPage({ params, searchParams }: CashPageProps) {
  const [{ tenant: tenantSlug }, query] = await Promise.all([params, searchParams])
  const tenant = await getCachedTenantBySlug(tenantSlug)
  if (!tenant) notFound()

  const db = (await createClient()) as unknown as SupabaseClient
  const [{ user, appUser, roleError }, scheduleRead, outletsRead] = await Promise.all([
    getRequestCaller(),
    readCutoffScheduleForDisplay(db, tenant.id),
    readOutlets(db, tenant.id).then(
      (outlets) => ({ ok: true as const, outlets }),
      (error: unknown) => ({ ok: false as const, error }),
    ),
  ])

  const state = buildCashPage({
    tenant: { id: tenant.id, slug: tenantSlug, multiBranchEnabled: isMultiBranchEnabled(tenant) },
    // Fail closed: an errored account read is no account, never store-wide.
    appUser: roleError ? null : appUser,
    outlets: outletsRead.ok ? outletsRead.outlets : [],
    searchParams: query,
    schedule: scheduleRead.schedule,
    now: Date.now(),
  })

  if (state.kind === 'refused') {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        {PAGE_TITLE}
        <CashLocked reason={state.reason} />
      </div>
    )
  }
  if (!outletsRead.ok) {
    console.error('[cash] branches unavailable', outletsRead.error instanceof Error ? outletsRead.error.message : outletsRead.error)
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        {PAGE_TITLE}
        <CashLoadFailed what="your branches" />
      </div>
    )
  }

  const { context } = state
  const waitingCount = await readWaitingCount(db, context.tenantId, context.outletId)
  const isPlatformBackend = resolveOrderBackend(tenant) === 'platform'
  const isMultiBranch = isMultiBranchEnabled(tenant) && outletsRead.outlets.filter((outlet) => outlet.isActive).length >= 2
  const periodBranches = isMultiBranch
    ? outletsRead.outlets.filter((outlet) => outlet.isActive).map((outlet) => ({ value: outlet.id, label: outlet.name }))
    : null

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <CashHeader context={context} />
      {(context.dayError || scheduleRead.isFallback) && (
        <div className="flex flex-col gap-2">
          {context.dayError && <CashNotice tone="warning">{context.dayError}</CashNotice>}
          {scheduleRead.isFallback && (
            <CashNotice>{SCHEDULE_FALLBACK_NOTE}</CashNotice>
          )}
        </div>
      )}
      <CashTabs context={context} waitingCount={waitingCount} />
      <Suspense
        key={`${context.tab}-${context.day}-${context.outletId ?? 'all'}`}
        fallback={
          <>
            <KpiRowSkeleton />
            <TableSkeleton />
          </>
        }
      >
        {context.tab === 'accept' ? (
          <CashAcceptSection context={context} viewerUserId={user?.id ?? ''} />
        ) : context.tab === 'settings' ? (
          <CashSettingsSection
            context={context}
            schedule={scheduleRead.schedule}
            isScheduleFallback={scheduleRead.isFallback}
            isPlatformBackend={isPlatformBackend}
            branches={periodBranches}
          />
        ) : (
          <CashShiftsSection context={context} isPlatformBackend={isPlatformBackend} />
        )}
      </Suspense>
      <footer className="border-t border-border pt-4 text-[12.5px] leading-relaxed text-muted-foreground">
        For your own records. Not an official receipt and not a BIR reading. All times are Philippine time.
      </footer>
    </div>
  )
}
