import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight, Clock } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCachedTenantBySlug } from '@/lib/cache'
import { verifyTenantAdmin } from '@/lib/admin-service'
import { getRequestCaller } from '@/lib/auth/request-caller'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPublishedLesson } from '@/lib/university/public-reads'
import { readWatchedLessonIds } from '@/lib/university/learn-data'
import { VideoPlayer } from '@/components/university/video-player'
import { LessonBody } from '@/components/university/lesson-body'
import { ResourceList } from '@/components/university/resource-list'
import { WatchedToggle } from '@/components/admin/learn/watched-toggle'

export const dynamic = 'force-dynamic'

interface AdminLessonPageProps {
  params: Promise<{ tenant: string; course: string; lesson: string }>
}

/** One lesson, played inside the admin, with "Mark as watched" and the next lesson. */
export default async function AdminLessonPage({ params }: AdminLessonPageProps) {
  const { tenant: tenantSlug, course: courseSlug, lesson: lessonSlug } = await params
  const tenant = await getCachedTenantBySlug(tenantSlug)
  if (!tenant) notFound()
  await verifyTenantAdmin(tenant.id, 'view')

  const result = await getPublishedLesson(courseSlug, lessonSlug)
  if (!result) notFound()
  const { course, lesson } = result
  const ordered = course.modules.flatMap((module) => module.lessons)
  const position = ordered.findIndex((row) => row.id === lesson.id)
  if (position === -1) notFound()
  const next = ordered[position + 1] ?? null
  const chapter = course.modules.find((row) => row.id === lesson.moduleId)

  const { user } = await getRequestCaller()
  const watched = await readWatchedLessonIds(createAdminClient() as unknown as SupabaseClient, user?.id ?? null)
  const learnPath = `/${tenantSlug}/admin/learn`

  return (
    <article className="mx-auto max-w-3xl pb-16">
      <Link href={learnPath} className="inline-flex min-h-11 items-center gap-1.5 text-[13.5px] font-bold text-wn-stone hover:text-wn-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Learn
      </Link>
      <p className="mt-2 text-[11.5px] font-bold uppercase tracking-[0.08em] text-wn-stone">
        {chapter ? chapter.title : course.title} · {position + 1} of {ordered.length}
      </p>
      <h1 className="mt-1.5 text-[1.75rem] font-extrabold leading-tight tracking-[-0.02em] text-wn-ink">{lesson.title}</h1>
      {lesson.durationMinutes ? (
        <p className="mt-1.5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-wn-stone">
          <Clock className="h-3.5 w-3.5" aria-hidden /> {lesson.durationMinutes} min
        </p>
      ) : null}

      {lesson.videoUrl && <div className="mt-5"><VideoPlayer url={lesson.videoUrl} title={lesson.title} /></div>}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <WatchedToggle tenantId={tenant.id} tenantSlug={tenantSlug} courseSlug={course.slug} lessonSlug={lesson.slug} isWatched={watched.has(lesson.id)} />
        {next && (
          <Link href={`${learnPath}/${course.slug}/${next.slug}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-wn-line bg-white px-4 text-[14px] font-bold text-wn-ink hover:bg-wn-sand">
            Next: <span className="max-w-[16rem] truncate">{next.title}</span> <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        )}
      </div>

      {lesson.summary && <p className="mt-6 text-[16px] italic leading-relaxed text-wn-stone">{lesson.summary}</p>}
      <div className="mt-6"><LessonBody blocks={lesson.blocks} /></div>
      {lesson.resources.length > 0 && <div className="mt-8"><ResourceList resources={lesson.resources} /></div>}
    </article>
  )
}
