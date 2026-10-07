/**
 * Server half of the first-week plan: read which starter-course lessons are
 * published right now, then build the plan. The University read is cached
 * (shared with the public portal); a failed read degrades to a plan without
 * lesson links rather than failing the page that shows it.
 */

import { getPublishedCourse } from '@/lib/university/public-reads'
import { buildFirstWeekPlan, STARTER_COURSE_SLUG, type FirstWeekPlan } from './first-week'

async function readStarterLessons(): Promise<ReadonlyMap<string, string> | null> {
  try {
    const course = await getPublishedCourse(STARTER_COURSE_SLUG)
    if (!course) return null
    return new Map(course.modules.flatMap((module) => module.lessons.map((lesson) => [lesson.slug, lesson.title] as const)))
  } catch (error) {
    console.error('[onboarding] starter course could not be read', error instanceof Error ? error.message : error)
    return null
  }
}

export async function loadFirstWeekPlan(tenantSlug: string, platformOrigin: string): Promise<FirstWeekPlan> {
  return buildFirstWeekPlan({ platformOrigin, tenantSlug, lessons: await readStarterLessons() })
}
