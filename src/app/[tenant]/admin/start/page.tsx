import Image from 'next/image'
import { notFound, redirect } from 'next/navigation'
import { getCachedTenantBySlug } from '@/lib/cache'
import { verifyTenantAdmin } from '@/lib/admin-service'
import { getRequestCaller } from '@/lib/auth/request-caller'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPublishedCourse } from '@/lib/university/public-reads'
import { STARTER_COURSE_SLUG, resolvePlatformOrigin } from '@/lib/onboarding/first-week'
import { GOALS } from '@/lib/onboarding/goals'
import { loadStartHere } from '@/lib/onboarding/start-path-data'
import { findOnboardingByTenant } from '@/lib/onboarding/repository'
import { loadLaunchSnapshot } from '@/lib/onboarding/launch-snapshot'
import { buildLaunchReadiness } from '@/lib/onboarding/readiness'
import { listStoreAddresses } from '@/lib/qr-print/qr-links'
import { LaunchChecklist } from '@/components/admin/launch/launch-checklist'
import { PathStepRow, type LessonChip } from '@/components/admin/start-here/path-step'
import { GoalTrackerCard } from '@/components/admin/start-here/goal-tracker-card'
import { ReadyCard } from '@/components/admin/start-here/ready-card'
import type { SupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

interface StartPageProps {
  params: Promise<{ tenant: string }>
}

type LessonIndex = ReadonlyMap<string, { title: string; minutes: number | null }>

async function readLessonIndex(): Promise<LessonIndex> {
  try {
    const course = await getPublishedCourse(STARTER_COURSE_SLUG)
    return new Map((course?.modules ?? []).flatMap((module) => module.lessons.map((lesson) => [lesson.slug, { title: lesson.title, minutes: lesson.durationMinutes }] as const)))
  } catch (error) {
    console.error('[start-here] lessons could not be read', error instanceof Error ? error.message : error)
    return new Map()
  }
}

function lessonChips(slugs: readonly string[], index: LessonIndex, adminPath: string): LessonChip[] {
  return slugs.flatMap((slug) => {
    const lesson = index.get(slug)
    return lesson ? [{ slug, title: lesson.title, minutes: lesson.minutes, href: `${adminPath}/learn/${STARTER_COURSE_SLUG}/${slug}` }] : []
  })
}

async function readLeadStatus(admin: ReturnType<typeof createAdminClient>, leadId: string): Promise<string | null> {
  const { data } = await admin.from('checkout_leads').select('status').eq('id', leadId).maybeSingle()
  return (data as { status: string } | null)?.status ?? null
}

/**
 * "Start here": the owner's first weeks as one path, ticked by the store's own
 * data, with each step's short video beside it, and one tracker per goal they
 * picked at set-up. A store that is not open yet sees its launch checklist on
 * top. Only for stores set up through onboarding; others go to the dashboard.
 */
export default async function StartHerePage({ params }: StartPageProps) {
  const { tenant: tenantSlug } = await params
  const tenant = await getCachedTenantBySlug(tenantSlug)
  if (!tenant) notFound()
  await verifyTenantAdmin(tenant.id, 'view')

  const admin = createAdminClient()
  const { user } = await getRequestCaller()
  const adminPath = `/${tenantSlug}/admin`
  const [shareAddress] = listStoreAddresses({ slug: tenantSlug, domain: tenant.domain ?? null, rootDomain: process.env.PLATFORM_ROOT_DOMAIN ?? null, appUrl: null })
  const [data, lessons] = await Promise.all([
    loadStartHere(admin as unknown as SupabaseClient, tenant, {
      userId: user?.id ?? null,
      shareUrl: shareAddress?.label ?? null,
      platformOrigin: resolvePlatformOrigin(),
    }),
    readLessonIndex(),
  ])
  if (!data) redirect(adminPath)

  const isPrelaunch = tenant.is_prelaunch === true
  const launch = isPrelaunch ? await loadLaunchPanel(admin, tenant) : null
  const goalTitles = data.goals.map((goal) => GOALS[goal].title)
  const greeting = data.firstName ? `Hi ${data.firstName}, here's your next step` : "Here's your next step"
  const positionOf = new Map(data.path.units.flatMap((unit) => unit.steps).map((step, index) => [step.id, index + 1]))

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      {launch && (
        <section id="launch" className="scroll-mt-20">
          <LaunchChecklist
            tenantId={tenant.id}
            tenantSlug={tenantSlug}
            readiness={launch.readiness}
            summary={launch.summary}
            isLive={false}
            isLaunchRequested={launch.isLaunchRequested}
            isPaymentConfirmed={launch.isPaymentConfirmed}
          />
        </section>
      )}

      <header className="flex items-start gap-3.5">
        <Image src="/assistant/owl-96.webp" alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-full ring-1 ring-wn-line" />
        <div className="min-w-0 flex-1">
          <h1 className="text-[1.6rem] font-extrabold leading-tight tracking-[-0.02em] text-wn-ink sm:text-[1.85rem]">
            {data.path.isComplete ? 'You finished your first weeks' : greeting}
          </h1>
          <p className="mt-1 text-[14px] text-wn-stone">
            {goalTitles.length > 0 && <>Your goals: <b className="text-wn-ink">{goalTitles.join(' · ')}</b> · </>}
            {data.path.done} of {data.path.total} done
          </p>
          <div
            className="mt-3 h-2.5 max-w-md overflow-hidden rounded-full bg-wn-line"
            role="progressbar" aria-label="Start here progress" aria-valuemin={0} aria-valuemax={data.path.total} aria-valuenow={data.path.done}
          >
            <div className="h-full rounded-full bg-wn-coral transition-[width] duration-700" style={{ width: `${Math.max((data.path.done / data.path.total) * 100, 3)}%` }} />
          </div>
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-7">
          {data.path.units.map((unit) => (
            <section key={unit.id} aria-labelledby={`unit-${unit.id}`}>
              <div className="mb-2.5 flex items-baseline gap-2">
                <h2 id={`unit-${unit.id}`} className="text-[15px] font-extrabold text-wn-ink">{unit.title}</h2>
                <span className="text-[12.5px] text-wn-stone">{unit.subtitle}</span>
              </div>
              <ol className="space-y-2.5">
                {unit.steps.map((step) => (
                  <PathStepRow
                    key={step.id}
                    step={step}
                    position={positionOf.get(step.id) ?? 0}
                    lessons={lessonChips(step.lessonSlugs, lessons, adminPath)}
                    tenantId={tenant.id}
                    tenantSlug={tenantSlug}
                  />
                ))}
              </ol>
            </section>
          ))}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20" aria-label="Your goals">
          {data.trackers.map((tracker) => <GoalTrackerCard key={tracker.goal} tracker={tracker} />)}
          <ReadyCard ready={data.ready} warnings={data.warnings} />
        </aside>
      </div>
    </div>
  )
}

async function loadLaunchPanel(admin: ReturnType<typeof createAdminClient>, tenant: NonNullable<Awaited<ReturnType<typeof getCachedTenantBySlug>>>) {
  const [snapshot, onboarding] = await Promise.all([loadLaunchSnapshot(admin, tenant), findOnboardingByTenant(admin, tenant.id)])
  const leadStatus = onboarding ? await readLeadStatus(admin, onboarding.checkoutLeadId) : null
  return {
    readiness: buildLaunchReadiness(snapshot),
    summary: onboarding?.summary ?? null,
    isLaunchRequested: !!onboarding?.launchRequestedAt,
    isPaymentConfirmed: leadStatus === 'paid' || leadStatus === 'live',
  }
}
