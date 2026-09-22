import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Clock, Layers } from 'lucide-react'
import { SMARTMENU } from '@/components/landing/landing-theme'
import { formatMinutes } from '@/components/university/course-card'
import { CourseCurriculum } from '@/components/university/course-curriculum'
import { CourseCover } from '@/components/university/course-cover'
import { CoursePanel } from '@/components/university/course-panel'
import { COURSE_LEVEL_LABEL } from '@/lib/university/blocks'
import { getPublishedCourse, listPublishedCourseParams } from '@/lib/university/public-reads'

export const revalidate = 300

/**
 * Prerender every published course so a visit is a CDN hit, not a render.
 * `dynamicParams` stays at its default, so a course published after the last
 * build still renders on demand and then joins the cache.
 */
export async function generateStaticParams() {
  return listPublishedCourseParams()
}

interface Params {
  params: Promise<{ course: string }>
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { course: slug } = await params
  const course = await getPublishedCourse(slug)
  if (!course) return { title: 'Course not found' }
  return { title: course.title, description: course.description ?? undefined }
}

export default async function CoursePage({ params }: Params) {
  const { course: slug } = await params
  const course = await getPublishedCourse(slug)
  if (!course) notFound()

  const lessons = course.modules.flatMap((module) => module.lessons)
  const minutes = lessons.reduce((sum, lesson) => sum + (lesson.durationMinutes ?? 0), 0)

  return (
    <>
      <section className="relative overflow-hidden" style={{ backgroundColor: SMARTMENU.ink }}>
        {course.coverImageUrl ? (
          <CourseCover url={course.coverImageUrl} sizes="100vw" priority className="absolute inset-0 h-full w-full object-cover opacity-30" />
        ) : null}
        <div className="absolute inset-0 hidden md:block" style={{ background: `linear-gradient(90deg, ${SMARTMENU.ink} 30%, ${SMARTMENU.ink}99 100%)` }} />
        <div className="absolute inset-0 md:hidden" style={{ background: `linear-gradient(180deg, ${SMARTMENU.ink}D9 0%, ${SMARTMENU.ink}B3 45%, ${SMARTMENU.ink}F2 100%)` }} />
        <div className="relative mx-auto max-w-6xl px-5 py-10 md:px-8 md:py-24">
          <Link href="/university" className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold transition-opacity hover:opacity-70" style={{ color: SMARTMENU.parchment }}>
            <ArrowLeft className="h-4 w-4" />
            All courses
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2 md:mt-6">
            <span className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ backgroundColor: SMARTMENU.amber, color: SMARTMENU.ink }}>
              {COURSE_LEVEL_LABEL[course.level]}
            </span>
            {course.category ? (
              <span className="rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white" style={{ borderColor: '#FFF7EE33' }}>
                {course.category}
              </span>
            ) : null}
          </div>
          <h1 className="font-display t-hero mt-4 max-w-3xl font-bold text-white">{course.title}</h1>
          {course.description ? (
            <p className="font-serif mt-4 max-w-2xl text-base italic md:mt-5 md:text-xl" style={{ color: SMARTMENU.parchment }}>
              {course.description}
            </p>
          ) : null}
          <p className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold md:mt-8" style={{ color: SMARTMENU.parchment }}>
            <span className="inline-flex items-center gap-1.5">
              <Layers className="h-4 w-4" />
              {lessons.length} {lessons.length === 1 ? 'lesson' : 'lessons'}
            </span>
            {minutes > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                {formatMinutes(minutes)}
              </span>
            ) : null}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-5 py-8 md:px-8 md:py-12">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10">
          <div className="min-w-0">
            {/* The start/continue card leads on a phone; on a wide screen it sits in the rail. */}
            <div className="lg:hidden">
              <CoursePanel course={course} />
            </div>

            <h2 className="font-display t-title mt-8 font-bold lg:mt-0" style={{ color: SMARTMENU.ink }}>
              What you&apos;ll learn
            </h2>
            <div className="mt-5 md:mt-6">
              <CourseCurriculum course={course} />
            </div>
          </div>

          <aside className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
            <div className="rounded-3xl border bg-white p-5" style={{ borderColor: `${SMARTMENU.ink}14` }}>
              <CoursePanel course={course} />
            </div>
          </aside>
        </div>
      </div>
    </>
  )
}
