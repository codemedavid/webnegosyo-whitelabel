/**
 * Where a lapsed merchant lands on the web.
 *
 * Lives OUTSIDE `/[tenant]/admin` on purpose: the admin layout is what
 * redirects here, so a page inside it would be redirected to itself forever and
 * the merchant would see a browser error instead of an explanation.
 *
 * Renders for anyone signed in, paused or not — a merchant who has just been
 * reinstated and follows an old link should see their bill, not a 404. The page
 * simply says which state they are in.
 */

import { redirect } from 'next/navigation'
import { getCachedTenantBySlug, getCachedCurrentUserRole } from '@/lib/cache'
import { createClient } from '@/lib/supabase/server'
import { fetchSubscription } from '@/lib/billing/subscription-repository'
import { resolveSubscriptionAccess } from '@/lib/billing/subscription-status'
import { MONTHLY_PRICE_PHP } from '@/lib/billing/plan'

const SUPPORT_EMAIL = 'support@webnegosyo.com'

function formatDay(dayKey: string | null): string {
  if (!dayKey) return '—'
  // Parsed as UTC and formatted in UTC so the label cannot drift a day either
  // way: a due date is a calendar date, not an instant.
  return new Date(`${dayKey}T00:00:00.000Z`).toLocaleDateString('en-PH', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default async function SubscriptionPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params

  const userRole = await getCachedCurrentUserRole()
  if (!userRole) redirect(`/${tenantSlug}/login?redirect=/${tenantSlug}/subscription`)

  const tenant = await getCachedTenantBySlug(tenantSlug)
  if (!tenant) redirect(`/${tenantSlug}/login`)

  const supabase = await createClient()
  const subscription = await fetchSubscription(supabase, tenant.id)
  const access = resolveSubscriptionAccess(subscription, new Date().toISOString())

  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-6 py-16">
      <div className="w-full rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">
          Subscription
        </p>

        <h1 className="mt-2 text-2xl font-extrabold text-neutral-900">
          {access.isBlocked ? 'Your account is on hold' : 'Your subscription'}
        </h1>

        <p className="mt-3 text-sm leading-6 text-neutral-600">
          {access.isBlocked
            ? `${tenant.name}'s admin tools are paused while the monthly subscription is unpaid.`
            : `${tenant.name} is paid up. Nothing to do here.`}
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-4 rounded-xl bg-neutral-50 p-4 text-sm">
          <div>
            <dt className="text-neutral-500">Monthly</dt>
            <dd className="font-semibold text-neutral-900">₱{MONTHLY_PRICE_PHP}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Paid through</dt>
            <dd className="font-semibold text-neutral-900">
              {formatDay(access.paidThroughDayKey)}
            </dd>
          </div>
          {access.daysOverdue > 0 && (
            <div className="col-span-2">
              <dt className="text-neutral-500">Overdue</dt>
              <dd className="font-semibold text-neutral-900">
                {access.daysOverdue} {access.daysOverdue === 1 ? 'day' : 'days'}
              </dd>
            </div>
          )}
        </dl>

        {/* Said plainly and early. The merchant's first fear on seeing this page
            is that their shop has gone offline and orders are being lost. It
            has not, and they are not. */}
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-900">Your store is still open</p>
          <p className="mt-1 text-sm leading-6 text-emerald-800">
            Customers can browse your menu and place orders as normal. Only the admin
            tools are paused.
          </p>
        </div>

        <p className="mt-6 text-sm leading-6 text-neutral-500">
          Already paid? Send your reference number to{' '}
          <a className="font-medium text-neutral-900 underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>{' '}
          and we will restore access.
        </p>
      </div>
    </main>
  )
}
