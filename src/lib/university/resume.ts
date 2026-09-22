/**
 * Where a learner should be dropped back into a course.
 *
 * There are no learner accounts, so completion is whatever this browser has
 * stored. Completion entries can name lessons the course no longer publishes;
 * they are simply ignored rather than shifting anyone's place.
 */
import type { LessonListItem } from './service'

export type ResumeState = 'start' | 'continue' | 'review'

export interface ResumePoint {
  lesson: LessonListItem
  /** Position in reading order, zero-based. */
  index: number
  state: ResumeState
}

export function resumePoint(lessons: LessonListItem[], completed: string[]): ResumePoint | null {
  const first = lessons[0]
  if (!first) return null

  const done = new Set(completed)
  const nextIndex = lessons.findIndex((lesson) => !done.has(lesson.slug))
  if (nextIndex === -1) return { lesson: first, index: 0, state: 'review' }

  const lesson = lessons[nextIndex]
  return { lesson, index: nextIndex, state: nextIndex === 0 ? 'start' : 'continue' }
}
