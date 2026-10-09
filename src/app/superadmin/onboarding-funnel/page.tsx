/**
 * Onboarding funnel: how far each paid buyer got through set-up and their
 * first weeks, which screen loses people, and who to call (set-ups gone quiet
 * before their store opened). Superadmin only.
 */

import { redirect } from 'next/navigation'
import { Clock, Rocket, ShoppingBag, Users } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { KpiCard, PageHeader, Panel, SectionHeader } from '@/components/superadmin/ui/primitives'
import { getRequestCaller } from '@/lib/auth/request-caller'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildFunnelReport } from '@/lib/onboarding/funnel'
import { FUNNEL_WINDOW_DAYS, loadFunnelSetups } from '@/lib/onboarding/funnel-data'

export const dynamic = 'force-dynamic'

function percent(share: number | null): string {
  return share === null ? '—' : `${Math.round(share * 100)}%`
}

function hoursLabel(hours: number | null): string {
  if (hours === null) return '—'
  if (hours < 48) return `${Math.round(hours)} h`
  return `${Math.round(hours / 24)} days`
}

export default async function OnboardingFunnelPage() {
  const { appUser } = await getRequestCaller()
  if (appUser?.role !== 'superadmin') redirect('/superadmin')

  let error: string | null = null
  const setups = await loadFunnelSetups(createAdminClient() as unknown as SupabaseClient).catch((caught: unknown) => {
    error = caught instanceof Error ? caught.message : 'The funnel could not be read.'
    return []
  })
  const report = buildFunnelReport(setups, Date.now())
  const stage = (id: string) => report.stages.find((row) => row.id === id)
  const maxCount = Math.max(1, ...report.stages.map((row) => row.count))

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Dashboard', href: '/superadmin' }, { label: 'Onboarding funnel' }]} />
      <PageHeader
        eyebrow="Operations"
        title="Onboarding funnel"
        subtitle={`Paid set-ups from the last ${FUNNEL_WINDOW_DAYS} days: where buyers stop, and who to call.`}
      />

      {error && <Panel className="border-red-400/30 text-sm text-red-300">{error}</Panel>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Set-ups" value={setups.length} icon={Users} hint={`${stage('opened')?.count ?? 0} opened their link`} />
        <KpiCard label="Stores opened" value={stage('live')?.count ?? 0} icon={Rocket} hint={`${percent(stage('live')?.share ?? null)} of opened links`} />
        <KpiCard label="First order" value={stage('first_order')?.count ?? 0} icon={ShoppingBag} hint={`${percent(stage('first_order')?.share ?? null)} of opened links`} />
        <KpiCard label="Time to first order" value={hoursLabel(report.medianHoursToFirstOrder)} icon={Clock} hint="Median, from opening" />
      </div>

      <Panel>
        <SectionHeader title="Stages" subtitle="Each set-up counted once per stage it reached." />
        <ol className="mt-5 space-y-2.5">
          {report.stages.map((row) => (
            <li key={row.id} className="grid grid-cols-[minmax(0,11rem)_1fr_4.5rem] items-center gap-3 text-sm">
              <span className="truncate text-white/80">{row.label}</span>
              <span className="h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                <span className="block h-full rounded-full bg-white/70" style={{ width: `${(row.count / maxCount) * 100}%` }} />
              </span>
              <span className="text-right tabular-nums text-white">
                {row.count} <span className="text-white/45">{percent(row.share)}</span>
              </span>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel>
        <SectionHeader title="Gone quiet before opening" subtitle="No activity for a day or more and the store is not open yet. Worth a message." />
        {report.stalled.length === 0 ? (
          <p className="mt-4 text-sm text-white/55">Nobody is stuck right now.</p>
        ) : (
          <ul className="mt-4 divide-y divide-white/10">
            {report.stalled.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0 truncate font-medium text-white">{row.businessName}</span>
                <span className="shrink-0 text-white/55">{row.stage} · quiet {row.quietDays}d</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
