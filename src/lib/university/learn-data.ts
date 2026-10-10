/**
 * The admin's Learn page: the published University catalog (the same cached
 * reads the public portal uses) plus what THIS person has watched. Server-only.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getPublishedCourse, getPublishedCourses } from './public-reads'
import type { CourseWithCurriculum, LessonListItem } from './service'

export interface LearnLesson extends LessonListItem {
  courseSlug: string
  courseTitle: string
  moduleTitle: string
}

export interface LearnCatalog {
  courses: CourseWithCurriculum[]
  lessons: LearnLesson[]
  bySlug: ReadonlyMap<string, LearnLesson>
}

/** A person watches dozens of lessons at most; this bounds the read. */
const MAX_PROGRESS_ROWS = 500

export async function loadLearnCatalog(): Promise<LearnCatalog> {
  const summaries = await getPublishedCourses()
  const courses = (await Promise.all(summaries.map((summary) => getPublishedCourse(summary.slug))))
    .filter((course): course is CourseWithCurriculum => course !== null)
  const lessons = courses.flatMap((course) => course.modules.flatMap((module) => module.lessons.map((lesson) => ({
    ...lesson,
    courseSlug: course.slug,
    courseTitle: course.title,
    moduleTitle: module.title,
  }))))
  return { courses, lessons, bySlug: new Map(lessons.map((lesson) => [lesson.slug, lesson])) }
}

/** Lesson ids this person marked watched; empty (never an error) when the read fails. */
export async function readWatchedLessonIds(admin: SupabaseClient, userId: string | null): Promise<Set<string>> {
  if (!userId) return new Set()
  const { data, error } = await admin
    .from('university_lesson_progress')
    .select('lesson_id')
    .eq('user_id', userId)
    .limit(MAX_PROGRESS_ROWS)
  if (error) {
    console.error('[learn] watched lessons could not be read', error.message)
    return new Set()
  }
  return new Set(((data ?? []) as Array<{ lesson_id: string }>).map((row) => row.lesson_id))
}
