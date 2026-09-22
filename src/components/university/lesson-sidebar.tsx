'use client'

import { SMARTMENU } from '@/components/landing/landing-theme'
import type { CourseWithCurriculum } from '@/lib/university/service'
import { CourseOutline, ProgressMeter } from './course-outline'
import { useCourseProgress } from './progress'

interface Props {
  course: CourseWithCurriculum
  currentLessonSlug: string | null
}

/**
 * The course outline beside a lesson on a wide screen: progress, then every
 * module and lesson with the current one highlighted. Phones get the same
 * outline from the bottom bar's contents sheet instead.
 */
export function LessonSidebar({ course, currentLessonSlug }: Props) {
  const { completed } = useCourseProgress(course.slug)
  const lessons = course.modules.flatMap((module) => module.lessons)
  const done = lessons.filter((lesson) => completed.includes(lesson.slug)).length

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: SMARTMENU.red }}>
          Course contents
        </p>
        <p className="font-display mt-0.5 text-base font-bold leading-tight" style={{ color: SMARTMENU.ink }}>
          {course.title}
        </p>
      </div>
      <ProgressMeter done={done} total={lessons.length} />
      <CourseOutline courseSlug={course.slug} modules={course.modules} currentLessonSlug={currentLessonSlug} completed={completed} />
    </div>
  )
}
