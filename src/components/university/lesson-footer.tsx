'use client'

import Link from 'next/link'
import { ArrowLeft, ArrowRight, Check, RotateCcw } from 'lucide-react'
import { SMARTMENU } from '@/components/landing/landing-theme'
import { useCourseProgress } from './progress'

interface Neighbour {
  slug: string
  title: string
}

interface Props {
  courseSlug: string
  lessonSlug: string
  previous: Neighbour | null
  next: Neighbour | null
}

/** Mark the lesson done and step to the neighbouring lessons. */
export function LessonFooter({ courseSlug, lessonSlug, previous, next }: Props) {
  const { completed, markComplete, markIncomplete } = useCourseProgress(courseSlug)
  const isDone = completed.includes(lessonSlug)

  return (
    <div className="mt-10 space-y-4 border-t pt-8" style={{ borderColor: `${SMARTMENU.ink}14` }}>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => (isDone ? markIncomplete(lessonSlug) : markComplete(lessonSlug))}
          className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-transform hover:-translate-y-0.5"
          style={
            isDone
              ? { backgroundColor: `${SMARTMENU.green}1A`, color: SMARTMENU.green, border: `1px solid ${SMARTMENU.green}66` }
              : { backgroundColor: SMARTMENU.green, color: '#fff', boxShadow: `0 12px 24px -12px ${SMARTMENU.green}B3` }
          }
        >
          {isDone ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          {isDone ? 'Completed · mark as not done' : 'Mark as complete'}
        </button>
        {next && !isDone ? (
          <span className="text-xs" style={{ color: `${SMARTMENU.cocoa}B3` }}>
            Then continue to the next lesson.
          </span>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {previous ? (
          <NeighbourLink href={`/university/${courseSlug}/${previous.slug}`} label="Previous" title={previous.title} align="left" />
        ) : (
          <span />
        )}
        {next ? (
          <NeighbourLink href={`/university/${courseSlug}/${next.slug}`} label="Next lesson" title={next.title} align="right" />
        ) : (
          <Link
            href={`/university/${courseSlug}`}
            className="flex items-center justify-end gap-3 rounded-2xl border bg-white px-5 py-4 text-right transition-colors hover:border-current"
            style={{ borderColor: `${SMARTMENU.ink}14`, color: SMARTMENU.ink }}
          >
            <span>
              <span className="block text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: SMARTMENU.red }}>
                Course complete
              </span>
              <span className="block text-sm font-semibold">Back to the course overview</span>
            </span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  )
}

function NeighbourLink({ href, label, title, align }: { href: string; label: string; title: string; align: 'left' | 'right' }) {
  const isRight = align === 'right'
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-2xl border bg-white px-5 py-4 transition-colors hover:border-current ${isRight ? 'justify-end text-right' : ''}`}
      style={{ borderColor: `${SMARTMENU.ink}14`, color: SMARTMENU.ink }}
    >
      {!isRight ? <ArrowLeft className="h-4 w-4 shrink-0" /> : null}
      <span className="min-w-0">
        <span className="block text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: `${SMARTMENU.cocoa}B3` }}>
          {label}
        </span>
        <span className="block truncate text-sm font-semibold">{title}</span>
      </span>
      {isRight ? <ArrowRight className="h-4 w-4 shrink-0" /> : null}
    </Link>
  )
}
