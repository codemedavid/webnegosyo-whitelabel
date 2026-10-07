/**
 * The collections roster as a month: whose subscription falls due on which
 * day, who already paid, and who to ask for money today.
 *
 * Same reads and the same verdicts as the Subscriptions list
 * (`collections-data.ts`), so a client cannot be "late" on one screen and
 * "current" on the other.
 */

import Link from 'next/link'
import { List } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildSubscriptionRoster } from '@/lib/billing/subscription-roster'
import { summarizePaymentsByTenant } from '@/lib/billing/payment-history'
import { buildCollectionsInsights } from '@/lib/billing/collections-insight'
import {
  ROSTER_SUBSCRIPTION_COLUMNS,
  loadActivitySnapshots,
  loadPaymentLedger,
  toRosterInputs,
  type RosterSubscriptionShape,
  type RosterTenantShape,
} from '@/lib/billing/collections-data'
import {
  buildCollectionsCalendar,
  parseMonthKey,
  shiftMonthKey,
} from '@/lib/billing/collections-calendar'
import { toBusinessDayKey } from '@/lib/inventory/business-day'
import { CollectionsCalendarView } from '@/components/superadmin/subscriptions/collections-calendar'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { PageHeader } from '@/components/superadmin/ui/primitives'

export const dynamic = 'force-dynamic'

const CALENDAR_PATH = '/superadmin/subscriptions/calendar'

function monthLabel(monthKey: string): string {
  return new Date(`${monthKey}-01T00:00:00.000Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  })
}

interface CalendarPageProps {
  searchParams: Promise<{ month?: string | string[] }>
}

export default async function CollectionsCalendarPage({ searchParams }: CalendarPageProps) {
  const { month } = await searchParams
  const supabase = createAdminClient()
  const nowIso = new Date().toISOString()
  const todayKey = toBusinessDayKey(nowIso)
  const monthKey = parseMonthKey(month, todayKey)

  const [tenantsResult, subscriptionsResult, ledger, activity] = await Promise.all([
    supabase.from('tenants').select('id, name, slug, created_at').order('name'),
    supabase.from('tenant_subscriptions').select(ROSTER_SUBSCRIPTION_COLUMNS),
    loadPaymentLedger(supabase),
    loadActivitySnapshots(nowIso),
  ])

  const rosterError = tenantsResult.error ?? subscriptionsResult.error
  if (rosterError) {
    console.error('[collections-calendar] roster read failed:', rosterError.message)
  }

  const rows = buildSubscriptionRoster(
    toRosterInputs(
      (tenantsResult.data ?? []) as RosterTenantShape[],
      (subscriptionsResult.data ?? []) as RosterSubscriptionShape[]
    ),
    nowIso
  )
  const insights = ledger
    ? buildCollectionsInsights(rows, summarizePaymentsByTenant(ledger), activity)
    : undefined

  const calendar = buildCollectionsCalendar({
    rows,
    insights,
    ledger: ledger ?? undefined,
    monthKey,
    todayKey,
  })

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: '/superadmin' },
          { label: 'Subscriptions', href: '/superadmin/subscriptions' },
          { label: 'Calendar' },
        ]}
      />
      <PageHeader
        eyebrow="Billing"
        title="Collections calendar"
        subtitle="Each subscriber sits on the day their monthly payment falls due. Ask the left list today; plan the rest from the calendar."
        actions={
          <Link
            href="/superadmin/subscriptions"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:border-white/30 hover:text-white"
          >
            <List className="h-4 w-4" />
            Subscriptions list
          </Link>
        }
      />

      {rosterError && (
        <p
          role="alert"
          className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300"
        >
          Subscribers could not be loaded. The calendar below may be empty or incomplete — refresh
          to try again.
        </p>
      )}
      {!ledger && (
        <p
          role="alert"
          className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300"
        >
          The payment ledger could not be read, so paid days and first-payment labels are hidden.
          Due dates are still accurate.
        </p>
      )}

      {/* Keyed by month: the picked day belongs to the month it was picked in. */}
      <CollectionsCalendarView
        key={monthKey}
        calendar={calendar}
        monthLabel={monthLabel(monthKey)}
        prevHref={`${CALENDAR_PATH}?month=${shiftMonthKey(monthKey, -1)}`}
        nextHref={`${CALENDAR_PATH}?month=${shiftMonthKey(monthKey, 1)}`}
        todayHref={CALENDAR_PATH}
        isCurrentMonth={monthKey === todayKey.slice(0, 7)}
        todayKey={todayKey}
      />
    </div>
  )
}
