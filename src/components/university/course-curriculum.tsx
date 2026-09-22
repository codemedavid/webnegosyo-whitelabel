'use client'

import Link from 'next/link'
import { Check, ChevronRight, FileText, Play } from 'lucide-react'
import { SMARTMENU } from '@/components/landing/landing-theme'
import { lessonKind } from '@/lib/university/blocks'
import type { CourseWithCurriculum } from '@/lib/university/service'
import { useCourseProgress } from './progress'

/**
 * The course's lesson list. Each row is a card-width tap target that says what
 * the lesson is (video or read), how long it takes and whether this browser has
 * already finished it.
 */
export function CourseCurriculum({ course }: { course: CourseWithCurriculum }) {
  const { completed } = useCourseProgress(course.slug)

  return (
    <ol className="space-y-5">
      {course.modules.map((module, moduleIndex) => (
        <li
          key={module.id}
          className="overflow-hidden rounded-3xl border bg-white"
          style={{ borderColor: `${SMARTMENU.ink}14` }}
        >
          <div className="px-4 pt-5 md:px-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: SMARTMENU.red }}>
              Module {moduleIndex + 1}
            </p>
            <h3 className="font-display mt-1 text-lg font-bold leading-tight md:text-xl" style={{ color: SMARTMENU.ink }}>
              {module.title}
            </h3>
            {module.description ? (
              <p className="mt-1.5 text-sm leading-relaxed" style={{ color: SMARTMENU.cocoa }}>
                {module.description}
              </p>
            ) : null}
          </div>

          <ul className="mt-3 divide-y px-2 pb-2 md:px-4 md:pb-4" style={{ borderColor: `${SMARTMENU.ink}0F` }}>
            {module.lessons.map((lesson, lessonIndex) => {
              const isDone = completed.includes(lesson.slug)
              const isVideo = lessonKind(lesson) === 'video'
              const Icon = isVideo ? Play : FileText
              return (
                <li key={lesson.id}>
                  <Link
                    href={`/university/${course.slug}/${lesson.slug}`}
                    className="group flex min-h-[64px] items-center gap-3.5 rounded-2xl px-2 py-3 transition-colors md:px-3"
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[13px] font-bold"
                      style={{
                        borderColor: isDone ? SMARTMENU.green : `${SMARTMENU.ink}1F`,
                        backgroundColor: isDone ? SMARTMENU.green : SMARTMENU.creamDeep,
                        color: isDone ? '#fff' : SMARTMENU.cocoa,
                      }}
                    >
                      {isDone ? <Check className="h-4 w-4" /> : lessonIndex + 1}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold leading-snug group-hover:underline" style={{ color: SMARTMENU.ink }}>
                        {lesson.title}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: `${SMARTMENU.cocoa}B3` }}>
                        <Icon className="h-3 w-3" />
                        {isVideo ? 'Video' : 'Read'}
                        {lesson.durationMinutes ? <span>· {lesson.durationMinutes} min</span> : null}
                        {isDone ? <span style={{ color: SMARTMENU.green }}>· Done</span> : null}
                      </span>
                    </span>

                    <ChevronRight className="h-4 w-4 shrink-0 opacity-30 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              )
            })}
          </ul>
        </li>
      ))}
    </ol>
  )
}
