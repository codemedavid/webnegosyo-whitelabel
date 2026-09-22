'use client'

import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { SMARTMENU } from '@/components/landing/landing-theme'
import { readCompleted } from './progress'

/**
 * A catalog card's call to action, which knows whether this browser has been
 * here before. It renders "Start" on the server and on the first client pass,
 * then settles once localStorage has been read.
 *
 * Only the number of finished lessons is known here, not which; a course whose
 * lessons were renamed can carry stale entries, so the count is clamped.
 */
export function CourseCardCta({ courseSlug, lessonCount }: { courseSlug: string; lessonCount: number }) {
  const [done, setDone] = useState(0)

  useEffect(() => {
    setDone(Math.min(readCompleted(courseSlug).length, lessonCount))
  }, [courseSlug, lessonCount])

  const isComplete = lessonCount > 0 && done >= lessonCount
  const label = done === 0 ? 'Start' : isComplete ? 'Review' : 'Continue'

  return (
    <span className="ml-auto flex items-center gap-2">
      {done > 0 ? (
        <span className="text-[11px] font-bold" style={{ color: isComplete ? SMARTMENU.green : SMARTMENU.cocoa }}>
          {isComplete ? 'Done' : `${done}/${lessonCount}`}
        </span>
      ) : null}
      <span className="inline-flex items-center gap-1 transition-transform group-hover:translate-x-1" style={{ color: SMARTMENU.red }}>
        {label}
        <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </span>
  )
}
