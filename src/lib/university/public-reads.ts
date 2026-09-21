/**
 * Cached public reads for SmartMenu University.
 *
 * The portal is open to everyone and shows every visitor the same thing, so
 * it reads through the anonymous client (RLS: published rows only) inside
 * the storefront data cache. A write from the superadmin editor purges the
 * one `university` tag. Failures are never cached: a stalled database
 * degrades one page view, not the whole revalidation window.
 *
 * A failure is logged before it is degraded. Swallowing it silently left the
 * only visible symptom as `UncachedResultSignal` — the cache boundary's own
 * control-flow marker — which says nothing about what actually broke.
 */
import { createPublicClient, describePublicQueryError } from '@/lib/supabase/public'
import { createCachedRead, doNotCache, type Uncached } from '@/lib/storefront/cached-read'
import {
  getCourseBySlug,
  getLessonBySlug,
  listCourses,
  type CourseSummary,
  type CourseWithCurriculum,
  type LessonRecord,
} from './service'

export const UNIVERSITY_CACHE_TAG = 'university'

/**
 * Run a portal read, degrading a failure to `fallback` without caching it.
 * One helper so every read reports failure the same way.
 */
async function readOrDegrade<T>(label: string, read: () => Promise<T>, fallback: T): Promise<T | Uncached<T>> {
  try {
    return await read()
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught)
    console.error(`[university] ${label} failed: ${describePublicQueryError(message)}`)
    return doNotCache(fallback)
  }
}

/** A published course with only its published lessons, modules with none dropped. */
function publishedOnly(course: CourseWithCurriculum): CourseWithCurriculum {
  return {
    ...course,
    modules: course.modules
      .map((module) => ({ ...module, lessons: module.lessons.filter((lesson) => lesson.status === 'published') }))
      .filter((module) => module.lessons.length > 0),
  }
}

function loadPublishedCourses() {
  return readOrDegrade<CourseSummary[]>(
    'course catalog',
    async () => {
      const courses = await listCourses(createPublicClient())
      // A course with nothing to watch yet is not listed, however "published" it is.
      return courses.filter((course) => course.publishedLessonCount > 0)
    },
    []
  )
}

function loadPublishedCourse(slug: string) {
  return readOrDegrade<CourseWithCurriculum | null>(
    `course "${slug}"`,
    async () => {
      const course = await getCourseBySlug(createPublicClient(), slug)
      return course ? publishedOnly(course) : null
    },
    null
  )
}

function loadPublishedLesson(courseSlug: string, lessonSlug: string) {
  return readOrDegrade<{ course: CourseWithCurriculum; lesson: LessonRecord } | null>(
    `lesson "${courseSlug}/${lessonSlug}"`,
    async () => {
      const client = createPublicClient()
      const course = await getCourseBySlug(client, courseSlug)
      if (!course) return null
      const lesson = await getLessonBySlug(client, course.id, lessonSlug)
      return lesson ? { course: publishedOnly(course), lesson } : null
    },
    null
  )
}

export const getPublishedCourses = createCachedRead(['university-courses'], loadPublishedCourses, {
  tags: () => [UNIVERSITY_CACHE_TAG],
})

export const getPublishedCourse = createCachedRead(['university-course'], loadPublishedCourse, {
  tags: () => [UNIVERSITY_CACHE_TAG],
})

export const getPublishedLesson = createCachedRead(['university-lesson'], loadPublishedLesson, {
  tags: () => [UNIVERSITY_CACHE_TAG],
})
