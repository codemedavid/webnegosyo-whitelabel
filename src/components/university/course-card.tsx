/* eslint-disable @next/next/no-img-element */
import Link from 'next/link'
import { ArrowRight, BookOpen, Clock, Layers } from 'lucide-react'
import { SMARTMENU } from '@/components/landing/landing-theme'
import { COURSE_LEVEL_LABEL } from '@/lib/university/blocks'
import type { CourseSummary } from '@/lib/university/service'

export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return ''
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

const LEVEL_COLOR: Record<CourseSummary['level'], string> = {
  beginner: SMARTMENU.green,
  intermediate: SMARTMENU.amber,
  advanced: SMARTMENU.red,
}

export function CourseCard({ course }: { course: CourseSummary }) {
  const length = formatMinutes(course.totalMinutes)
  return (
    <Link
      href={`/university/${course.slug}`}
      className="group flex flex-col overflow-hidden rounded-3xl border bg-white transition-all hover:-translate-y-1 hover:shadow-[0_24px_48px_-24px_rgba(28,22,19,0.35)]"
      style={{ borderColor: `${SMARTMENU.ink}14` }}
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden" style={{ backgroundColor: SMARTMENU.creamDeep }}>
        {course.coverImageUrl ? (
          <img src={course.coverImageUrl} alt="" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
        ) : (
          <div className="graph flex h-full w-full items-center justify-center">
            <BookOpen className="h-10 w-10" style={{ color: `${SMARTMENU.ink}33` }} />
          </div>
        )}
        <span
          className="absolute left-4 top-4 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white"
          style={{ backgroundColor: LEVEL_COLOR[course.level] }}
        >
          {COURSE_LEVEL_LABEL[course.level]}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-6">
        {course.category ? (
          <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: SMARTMENU.red }}>
            {course.category}
          </p>
        ) : null}
        <h3 className="font-display mt-1 text-xl font-bold leading-tight" style={{ color: SMARTMENU.ink }}>
          {course.title}
        </h3>
        {course.description ? (
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed" style={{ color: SMARTMENU.cocoa }}>
            {course.description}
          </p>
        ) : null}
        <div className="mt-auto flex items-center gap-4 pt-5 text-xs font-semibold" style={{ color: SMARTMENU.cocoa }}>
          <span className="inline-flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            {course.publishedLessonCount} {course.publishedLessonCount === 1 ? 'lesson' : 'lessons'}
          </span>
          {length ? (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {length}
            </span>
          ) : null}
          <span className="ml-auto inline-flex items-center gap-1 transition-transform group-hover:translate-x-1" style={{ color: SMARTMENU.red }}>
            Start
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </Link>
  )
}
