'use client'

import Link from 'next/link'
import { Check, FileText, Play } from 'lucide-react'
import { SMARTMENU } from '@/components/landing/landing-theme'
import { lessonKind } from '@/lib/university/blocks'
import type { CourseWithCurriculum } from '@/lib/university/service'
import { useCourseProgress } from './progress'

interface Props {
  course: CourseWithCurriculum
  currentLessonSlug: string | null
}

/**
 * The course outline beside a lesson: every module and lesson, the current
 * one highlighted, completed ones ticked. Also the course page's curriculum,
 * where nothing is current.
 */
export function LessonSidebar({ course, currentLessonSlug }: Props) {
  const { completed } = useCourseProgress(course.slug)
  const total = course.modules.reduce((sum, module) => sum + module.lessons.length, 0)
  const done = course.modules.reduce(
    (sum, module) => sum + module.lessons.filter((lesson) => completed.includes(lesson.slug)).length,
    0
  )
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)

  return (
    <nav aria-label="Course outline" className="space-y-5">
      <div>
        <div className="flex items-center justify-between text-xs font-semibold" style={{ color: SMARTMENU.cocoa }}>
          <span>Your progress</span>
          <span>
            {done}/{total}
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: `${SMARTMENU.ink}14` }}>
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${percent}%`, backgroundColor: SMARTMENU.green }} />
        </div>
      </div>

      {course.modules.map((module, moduleIndex) => (
        <section key={module.id}>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: `${SMARTMENU.cocoa}B3` }}>
            Module {moduleIndex + 1}
          </p>
          <p className="font-display mt-0.5 text-sm font-bold" style={{ color: SMARTMENU.ink }}>
            {module.title}
          </p>
          <ul className="mt-2 space-y-1">
            {module.lessons.map((lesson) => {
              const isCurrent = lesson.slug === currentLessonSlug
              const isDone = completed.includes(lesson.slug)
              const Icon = lessonKind(lesson) === 'video' ? Play : FileText
              return (
                <li key={lesson.id}>
                  <Link
                    href={`/university/${course.slug}/${lesson.slug}`}
                    aria-current={isCurrent ? 'page' : undefined}
                    className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors"
                    style={{
                      backgroundColor: isCurrent ? SMARTMENU.ink : 'transparent',
                      color: isCurrent ? '#FFF7EE' : SMARTMENU.ink,
                    }}
                  >
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border"
                      style={{
                        borderColor: isDone ? SMARTMENU.green : isCurrent ? '#FFF7EE66' : `${SMARTMENU.ink}33`,
                        backgroundColor: isDone ? SMARTMENU.green : 'transparent',
                        color: isDone ? '#fff' : 'inherit',
                      }}
                    >
                      {isDone ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3 w-3 opacity-70" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{lesson.title}</span>
                    {lesson.durationMinutes ? <span className="shrink-0 text-[11px] opacity-60">{lesson.durationMinutes}m</span> : null}
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </nav>
  )
}
