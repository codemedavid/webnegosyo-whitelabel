'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, ChevronLeft, ChevronRight, Flag, ListOrdered, X } from 'lucide-react'
import { SMARTMENU } from '@/components/landing/landing-theme'
import type { CourseWithCurriculum } from '@/lib/university/service'
import { CourseOutline, ProgressMeter } from './course-outline'
import { useCourseProgress } from './progress'

/**
 * The phone's lesson controls: a bar pinned to the bottom of the screen with
 * the previous and next lesson, a done toggle, and the whole course outline a
 * tap away. Without it a learner has to scroll past the entire lesson to find
 * out what comes next. Hidden from large screens, which keep the sidebar.
 */
export function LessonNavBar({ course, currentLessonSlug }: { course: CourseWithCurriculum; currentLessonSlug: string }) {
  const [isSheetOpen, setSheetOpen] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const { completed, markComplete, markIncomplete } = useCourseProgress(course.slug)

  const lessons = course.modules.flatMap((module) => module.lessons)
  const position = lessons.findIndex((lesson) => lesson.slug === currentLessonSlug)
  const previous = position > 0 ? lessons[position - 1] : null
  const next = position >= 0 && position < lessons.length - 1 ? lessons[position + 1] : null
  const done = lessons.filter((lesson) => completed.includes(lesson.slug)).length
  const isDone = completed.includes(currentLessonSlug)

  const closeSheet = useCallback(() => setSheetOpen(false), [])

  useEffect(() => {
    if (!isSheetOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSheetOpen(false)
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isSheetOpen])

  return (
    <>
      <div
        className="lesson-nav-bar fixed inset-x-0 bottom-0 z-40 border-t lg:hidden"
        style={{
          backgroundColor: `${SMARTMENU.cream}F7`,
          borderColor: `${SMARTMENU.ink}14`,
          backdropFilter: 'blur(10px)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div className="flex items-center gap-2 px-3 py-2.5">
          <StepLink
            href={previous ? `/university/${course.slug}/${previous.slug}` : null}
            label="Previous lesson"
            icon={<ChevronLeft className="h-5 w-5" />}
          />

          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={isSheetOpen}
            className="flex min-h-[44px] min-w-0 flex-1 items-center justify-center gap-2 rounded-full border px-3 text-sm font-bold"
            style={{ borderColor: `${SMARTMENU.ink}1F`, color: SMARTMENU.ink, backgroundColor: '#fff' }}
          >
            <ListOrdered className="h-4 w-4 shrink-0" style={{ color: SMARTMENU.red }} />
            <span className="truncate">
              Lesson {position + 1} of {lessons.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => (isDone ? markIncomplete(currentLessonSlug) : markComplete(currentLessonSlug))}
            aria-pressed={isDone}
            aria-label={isDone ? 'Mark lesson as not done' : 'Mark lesson as complete'}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border"
            style={{
              borderColor: isDone ? SMARTMENU.green : `${SMARTMENU.ink}1F`,
              backgroundColor: isDone ? SMARTMENU.green : '#fff',
              color: isDone ? '#fff' : SMARTMENU.cocoa,
            }}
          >
            <Check className="h-5 w-5" />
          </button>

          {next ? (
            <StepLink
              href={`/university/${course.slug}/${next.slug}`}
              label="Next lesson"
              icon={<ChevronRight className="h-5 w-5" />}
              isPrimary
            />
          ) : (
            <StepLink href={`/university/${course.slug}`} label="Back to the course" icon={<Flag className="h-5 w-5" />} isPrimary />
          )}
        </div>
      </div>

      {isSheetOpen ? (
        <div className="fixed inset-0 z-50 flex items-end lg:hidden">
          <div
            aria-hidden
            onClick={closeSheet}
            className="sheet-fade absolute inset-0 bg-black/45"
            style={{ backdropFilter: 'blur(2px)' }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Course contents"
            className="sheet-rise relative flex max-h-[82vh] w-full flex-col rounded-t-3xl"
            style={{ backgroundColor: SMARTMENU.cream, paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <span className="mx-auto mt-2.5 h-1 w-10 rounded-full" style={{ backgroundColor: `${SMARTMENU.ink}26` }} aria-hidden />

            <div className="flex items-start gap-3 px-5 pb-3 pt-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: SMARTMENU.red }}>
                  Course contents
                </p>
                <p className="font-display truncate text-lg font-bold" style={{ color: SMARTMENU.ink }}>
                  {course.title}
                </p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={closeSheet}
                aria-label="Close course contents"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border"
                style={{ borderColor: `${SMARTMENU.ink}1F`, color: SMARTMENU.ink, backgroundColor: '#fff' }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-5 pb-2">
              <ProgressMeter done={done} total={lessons.length} />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-5 pt-2">
              <CourseOutline
                courseSlug={course.slug}
                modules={course.modules}
                currentLessonSlug={currentLessonSlug}
                completed={completed}
                onNavigate={closeSheet}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function StepLink({ href, label, icon, isPrimary }: { href: string | null; label: string; icon: React.ReactNode; isPrimary?: boolean }) {
  if (!href) {
    return (
      <span
        aria-hidden
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border opacity-30"
        style={{ borderColor: `${SMARTMENU.ink}1F`, color: SMARTMENU.cocoa }}
      >
        {icon}
      </span>
    )
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border"
      style={
        isPrimary
          ? { backgroundColor: SMARTMENU.red, borderColor: SMARTMENU.red, color: '#fff' }
          : { backgroundColor: '#fff', borderColor: `${SMARTMENU.ink}1F`, color: SMARTMENU.ink }
      }
    >
      {icon}
    </Link>
  )
}
