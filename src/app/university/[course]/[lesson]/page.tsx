import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Clock } from 'lucide-react'
import { SMARTMENU } from '@/components/landing/landing-theme'
import { LessonBody } from '@/components/university/lesson-body'
import { LessonFooter } from '@/components/university/lesson-footer'
import { LessonNavBar } from '@/components/university/lesson-nav-bar'
import { LessonSidebar } from '@/components/university/lesson-sidebar'
import { ResourceList } from '@/components/university/resource-list'
import { VideoPlayer } from '@/components/university/video-player'
import { getPublishedLesson, listPublishedLessonParams } from '@/lib/university/public-reads'

export const revalidate = 300

/** Prerender every published lesson; see the course page for the rationale. */
export async function generateStaticParams() {
  return listPublishedLessonParams()
}

interface Params {
  params: Promise<{ course: string; lesson: string }>
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { course: courseSlug, lesson: lessonSlug } = await params
  const result = await getPublishedLesson(courseSlug, lessonSlug)
  if (!result) return { title: 'Lesson not found' }
  return { title: `${result.lesson.title} · ${result.course.title}`, description: result.lesson.summary ?? undefined }
}

export default async function LessonPage({ params }: Params) {
  const { course: courseSlug, lesson: lessonSlug } = await params
  const result = await getPublishedLesson(courseSlug, lessonSlug)
  if (!result) notFound()
  const { course, lesson } = result

  const ordered = course.modules.flatMap((module) => module.lessons)
  const position = ordered.findIndex((row) => row.id === lesson.id)
  // A draft lesson is not in the published outline: it is not shown either.
  if (position === -1) notFound()
  const previous = position > 0 ? ordered[position - 1] : null
  const next = position < ordered.length - 1 ? ordered[position + 1] : null
  const chapter = course.modules.find((row) => row.id === lesson.moduleId)

  return (
    <div className="mx-auto max-w-6xl px-5 py-5 md:px-8 md:py-12">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <article className="min-w-0">
          <Link
            href={`/university/${course.slug}`}
            className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold transition-opacity hover:opacity-70"
            style={{ color: SMARTMENU.cocoa }}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="truncate">{course.title}</span>
          </Link>

          <header className="mt-1 md:mt-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: SMARTMENU.red }}>
              {chapter ? chapter.title : 'Lesson'} · {position + 1} of {ordered.length}
            </p>
            <h1 className="font-display t-title mt-2 font-bold" style={{ color: SMARTMENU.ink }}>
              {lesson.title}
            </h1>
            {lesson.durationMinutes ? (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: `${SMARTMENU.cocoa}B3` }}>
                <Clock className="h-3.5 w-3.5" />
                {lesson.durationMinutes} min
              </p>
            ) : null}
          </header>

          {/* The player comes before the summary so a phone opens straight onto it,
              and runs edge to edge where every pixel of width counts. */}
          {lesson.videoUrl ? (
            <div className="-mx-5 mt-5 md:mx-0 md:mt-7">
              <VideoPlayer url={lesson.videoUrl} title={lesson.title} className="rounded-none md:rounded-2xl" />
            </div>
          ) : null}

          {lesson.summary ? (
            <p className="font-serif mt-5 text-lg italic" style={{ color: SMARTMENU.cocoa }}>
              {lesson.summary}
            </p>
          ) : null}

          <div className="mt-7 md:mt-10">
            <LessonBody blocks={lesson.blocks} />
          </div>

          {lesson.resources.length > 0 ? (
            <div className="mt-10">
              <ResourceList resources={lesson.resources} />
            </div>
          ) : null}

          <LessonFooter
            courseSlug={course.slug}
            lessonSlug={lesson.slug}
            previous={previous ? { slug: previous.slug, title: previous.title } : null}
            next={next ? { slug: next.slug, title: next.title } : null}
          />
        </article>

        <aside className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
          <div className="rounded-3xl border bg-white p-5" style={{ borderColor: `${SMARTMENU.ink}14` }}>
            <LessonSidebar course={course} currentLessonSlug={lesson.slug} />
          </div>
        </aside>
      </div>

      <LessonNavBar course={course} currentLessonSlug={lesson.slug} />
    </div>
  )
}
