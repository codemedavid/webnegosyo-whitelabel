/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Clock, Layers, PlayCircle } from 'lucide-react'
import { SMARTMENU } from '@/components/landing/landing-theme'
import { formatMinutes } from '@/components/university/course-card'
import { LessonSidebar } from '@/components/university/lesson-sidebar'
import { COURSE_LEVEL_LABEL } from '@/lib/university/blocks'
import { getPublishedCourse } from '@/lib/university/public-reads'

export const revalidate = 300

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
  const first = lessons[0] ?? null

  return (
    <>
      <section className="relative overflow-hidden" style={{ backgroundColor: SMARTMENU.ink }}>
        {course.coverImageUrl ? (
          <img src={course.coverImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
        ) : null}
        <div className="absolute inset-0" style={{ background: `linear-gradient(90deg, ${SMARTMENU.ink} 30%, ${SMARTMENU.ink}99 100%)` }} />
        <div className="relative mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
          <Link href="/university" className="inline-flex items-center gap-1.5 text-sm font-semibold transition-opacity hover:opacity-70" style={{ color: SMARTMENU.parchment }}>
            <ArrowLeft className="h-4 w-4" />
            All courses
          </Link>
          <div className="mt-6 flex flex-wrap items-center gap-2">
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
            <p className="font-serif mt-5 max-w-2xl text-lg italic md:text-xl" style={{ color: SMARTMENU.parchment }}>
              {course.description}
            </p>
          ) : null}
          <div className="mt-8 flex flex-wrap items-center gap-4">
            {first ? (
              <Link
                href={`/university/${course.slug}/${first.slug}`}
                className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold text-white transition-transform hover:-translate-y-0.5"
                style={{ backgroundColor: SMARTMENU.red, boxShadow: `0 14px 30px -12px ${SMARTMENU.red}B3` }}
              >
                <PlayCircle className="h-4 w-4" />
                Start the course
              </Link>
            ) : null}
            <span className="inline-flex items-center gap-4 text-sm font-semibold" style={{ color: SMARTMENU.parchment }}>
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
            </span>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-5 py-12 md:px-8">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <h2 className="font-display t-title font-bold" style={{ color: SMARTMENU.ink }}>
              What you&apos;ll learn
            </h2>
            <ol className="mt-6 space-y-6">
              {course.modules.map((module, moduleIndex) => (
                <li key={module.id} className="rounded-3xl border bg-white p-6" style={{ borderColor: `${SMARTMENU.ink}14` }}>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: SMARTMENU.red }}>
                    Module {moduleIndex + 1}
                  </p>
                  <h3 className="font-display mt-1 text-xl font-bold" style={{ color: SMARTMENU.ink }}>
                    {module.title}
                  </h3>
                  {module.description ? (
                    <p className="mt-1 text-sm" style={{ color: SMARTMENU.cocoa }}>
                      {module.description}
                    </p>
                  ) : null}
                  <ul className="mt-4 divide-y" style={{ borderColor: `${SMARTMENU.ink}0F` }}>
                    {module.lessons.map((lesson, lessonIndex) => (
                      <li key={lesson.id}>
                        <Link href={`/university/${course.slug}/${lesson.slug}`} className="group flex items-center gap-4 py-3">
                          <span className="w-6 shrink-0 text-sm font-bold" style={{ color: `${SMARTMENU.cocoa}80` }}>
                            {lessonIndex + 1}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold group-hover:underline" style={{ color: SMARTMENU.ink }}>
                              {lesson.title}
                            </span>
                            {lesson.summary ? (
                              <span className="block truncate text-xs" style={{ color: SMARTMENU.cocoa }}>
                                {lesson.summary}
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-xs font-semibold" style={{ color: SMARTMENU.cocoa }}>
                            {lesson.videoUrl ? 'Video' : 'Read'}
                            {lesson.durationMinutes ? ` · ${lesson.durationMinutes} min` : ''}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </div>
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-3xl border bg-white p-5" style={{ borderColor: `${SMARTMENU.ink}14` }}>
              <LessonSidebar course={course} currentLessonSlug={null} />
            </div>
          </aside>
        </div>
      </div>
    </>
  )
}
