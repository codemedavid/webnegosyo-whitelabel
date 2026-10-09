import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Check, MessageCircle, PlayCircle } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCachedTenantBySlug } from '@/lib/cache'
import { verifyTenantAdmin } from '@/lib/admin-service'
import { getRequestCaller } from '@/lib/auth/request-caller'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadLearnCatalog, readWatchedLessonIds } from '@/lib/university/learn-data'
import { pickMustWatch } from '@/lib/university/learn-picks'
import { GOALS } from '@/lib/onboarding/goals'
import { hasStartHere } from '@/lib/onboarding/start-here-eligibility'
import { loadStartHere } from '@/lib/onboarding/start-path-data'
import { findOnboardingByTenant } from '@/lib/onboarding/repository'
import { resolvePlatformOrigin } from '@/lib/onboarding/first-week'
import { LessonCard } from '@/components/admin/learn/lesson-card'

export const dynamic = 'force-dynamic'

const HELP_URL = 'https://m.me/WebNegosyoOfficial'

interface LearnPageProps {
  params: Promise<{ tenant: string }>
}

/** Goals and the current Start-here step's lessons, for stores set up through onboarding. */
async function readFocus(admin: SupabaseClient, tenant: NonNullable<Awaited<ReturnType<typeof getCachedTenantBySlug>>>, userId: string | null) {
  if (await hasStartHere(tenant.id)) {
    const data = await loadStartHere(admin, tenant, { userId, shareUrl: null, platformOrigin: resolvePlatformOrigin() }).catch(() => null)
    const current = data?.path.units.flatMap((unit) => unit.steps).find((step) => step.state === 'current')
    if (data) return { goals: data.goals, currentStepLessons: current?.lessonSlugs ?? [] }
  }
  const onboarding = await findOnboardingByTenant(admin, tenant.id).catch(() => null)
  return { goals: onboarding?.answers?.goals ?? [], currentStepLessons: [] as string[] }
}

/**
 * Learn: SmartMenu University inside the admin. Videos play here (no new tab,
 * no platform links that 404 on a store's own domain), "Watch these first"
 * picks lessons for the owner's goals and next step, and watched lessons are
 * saved per person so phone and laptop agree.
 */
export default async function LearnPage({ params }: LearnPageProps) {
  const { tenant: tenantSlug } = await params
  const tenant = await getCachedTenantBySlug(tenantSlug)
  if (!tenant) notFound()
  await verifyTenantAdmin(tenant.id, 'view')

  const admin = createAdminClient() as unknown as SupabaseClient
  const { user } = await getRequestCaller()
  const [catalog, watchedIds, focus] = await Promise.all([
    loadLearnCatalog(),
    readWatchedLessonIds(admin, user?.id ?? null),
    readFocus(admin, tenant, user?.id ?? null),
  ])
  const adminPath = `/${tenantSlug}/admin`
  const watchedSlugs = new Set(catalog.lessons.filter((lesson) => watchedIds.has(lesson.id)).map((lesson) => lesson.slug))
  const picks = pickMustWatch({
    goals: focus.goals,
    currentStepLessons: focus.currentStepLessons,
    published: new Set(catalog.bySlug.keys()),
    watched: watchedSlugs,
  })
  const hrefOf = (courseSlug: string, slug: string) => `${adminPath}/learn/${courseSlug}/${slug}`
  const goalLine = focus.goals.map((goal) => GOALS[goal].title).join(' · ')
  const totalMinutes = picks.reduce((sum, pick) => sum + (catalog.bySlug.get(pick.slug)?.durationMinutes ?? 0), 0)

  return (
    <div className="mx-auto max-w-5xl space-y-9 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] font-extrabold tracking-[-0.02em] text-wn-ink">Learn</h1>
          <p className="mt-1 text-[14px] text-wn-stone">
            Short videos on running your store. {watchedSlugs.size} of {catalog.lessons.length} watched.
          </p>
        </div>
        <a href={HELP_URL} target="_blank" rel="noopener noreferrer"
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border-2 border-wn-line bg-white px-3.5 text-[13px] font-bold text-wn-ink hover:bg-wn-sand">
          <MessageCircle className="h-4 w-4" aria-hidden /> Message us
        </a>
      </header>

      {picks.length > 0 && (
        <section aria-labelledby="watch-first">
          <h2 id="watch-first" className="text-[18px] font-extrabold text-wn-ink">Watch these first</h2>
          <p className="mt-0.5 text-[13.5px] text-wn-stone">
            {goalLine ? `Picked for your goals (${goalLine}) and your next step.` : 'The basics every store needs.'}
            {totalMinutes > 0 ? ` About ${totalMinutes} minutes in all.` : ''}
          </p>
          <div className="mt-4 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {picks.map((pick) => {
              const lesson = catalog.bySlug.get(pick.slug)
              if (!lesson) return null
              const note = focus.currentStepLessons.includes(pick.slug) ? 'Your next step' : null
              return <LessonCard key={pick.slug} lesson={lesson} href={hrefOf(lesson.courseSlug, lesson.slug)} isWatched={pick.isWatched} isMustWatch note={note} />
            })}
          </div>
        </section>
      )}

      {catalog.courses.map((course) => (
        <section key={course.id} aria-labelledby={`course-${course.slug}`}>
          <h2 id={`course-${course.slug}`} className="text-[18px] font-extrabold text-wn-ink">{course.title}</h2>
          {course.modules.map((module) => (
            <div key={module.id} className="mt-4">
              <h3 className="text-[12px] font-bold uppercase tracking-[0.07em] text-wn-stone">{module.title}</h3>
              <ul className="mt-2 divide-y divide-wn-line overflow-hidden rounded-2xl bg-white ring-1 ring-border">
                {module.lessons.map((lesson) => {
                  const isWatched = watchedIds.has(lesson.id)
                  return (
                    <li key={lesson.id}>
                      <Link href={hrefOf(course.slug, lesson.slug)} className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-wn-sand">
                        {isWatched
                          ? <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-wn-ink text-white" aria-label="Watched"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>
                          : <PlayCircle className="h-7 w-7 shrink-0 text-wn-stone" aria-hidden />}
                        <span className={`min-w-0 flex-1 text-[14px] font-bold ${isWatched ? 'text-wn-stone' : 'text-wn-ink'}`}>{lesson.title}</span>
                        {lesson.durationMinutes ? <span className="shrink-0 text-[12.5px] text-wn-stone">{lesson.durationMinutes} min</span> : null}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </section>
      ))}

      {catalog.courses.length === 0 && (
        <p className="rounded-2xl border border-dashed border-wn-line bg-white/60 px-5 py-8 text-center text-sm text-wn-stone">
          Lessons could not be loaded just now. Please refresh in a minute.
        </p>
      )}
    </div>
  )
}
