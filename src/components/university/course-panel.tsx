'use client'

import Link from 'next/link'
import { PlayCircle, RotateCcw } from 'lucide-react'
import { SMARTMENU } from '@/components/landing/landing-theme'
import { resumePoint } from '@/lib/university/resume'
import type { CourseWithCurriculum } from '@/lib/university/service'
import { ProgressMeter } from './course-outline'
import { useCourseProgress } from './progress'

const CTA_LABEL = {
  start: 'Start the course',
  continue: 'Continue where you left off',
  review: 'Review the course',
} as const

/**
 * The course's one call to action: how far this browser has got and the single
 * lesson to open next. It replaces the outline that used to sit in the course
 * sidebar, which repeated the curriculum already on the page — on a phone that
 * meant scrolling the same list twice.
 *
 * It draws no frame of its own: on a phone it sits straight on the page, and
 * the wide-screen rail wraps it in a card.
 */
export function CoursePanel({ course }: { course: CourseWithCurriculum }) {
  const { completed } = useCourseProgress(course.slug)
  const lessons = course.modules.flatMap((module) => module.lessons)
  const done = lessons.filter((lesson) => completed.includes(lesson.slug)).length
  const point = resumePoint(lessons, completed)

  if (!point) return null

  return (
    <div>
      {done > 0 ? <ProgressMeter done={done} total={lessons.length} /> : null}

      <Link
        href={`/university/${course.slug}/${point.lesson.slug}`}
        className={`flex min-h-[56px] items-center gap-3 rounded-2xl px-5 py-3.5 text-left text-white transition-transform active:scale-[0.99] ${done > 0 ? 'mt-4' : ''}`}
        style={{ backgroundColor: SMARTMENU.red, boxShadow: `0 14px 30px -14px ${SMARTMENU.red}B3` }}
      >
        {point.state === 'review' ? <RotateCcw className="h-5 w-5 shrink-0" /> : <PlayCircle className="h-5 w-5 shrink-0" />}
        <span className="min-w-0">
          <span className="block text-[11px] font-bold uppercase tracking-[0.14em] opacity-80">{CTA_LABEL[point.state]}</span>
          <span className="block truncate text-sm font-bold">{point.lesson.title}</span>
        </span>
      </Link>

      <p className="mt-3 text-xs font-semibold" style={{ color: `${SMARTMENU.cocoa}B3` }}>
        Lesson {point.index + 1} of {lessons.length}
        {point.lesson.durationMinutes ? ` · ${point.lesson.durationMinutes} min` : ''}
      </p>
    </div>
  )
}
