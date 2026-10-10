/**
 * "Watch these first": the few lessons a new owner should see before any
 * other, picked for the goals they chose and the step they are on. Pure.
 *
 * Order: the lessons of their current Start-here step, then the lessons for
 * each of their goals, then the basics every store needs. Unpublished
 * lessons are never offered (a renamed lesson drops out instead of 404ing).
 */

import type { GoalId } from '@/lib/onboarding/goals'

export const MUST_WATCH_COUNT = 4

/** Every store, in this order. */
const BASICS = ['welcome-to-smartmenu', 'downloading-the-app', 'first-order-sa-smartmenu'] as const

const FOR_GOAL: Record<GoalId, readonly string[]> = {
  ordering: ['adding-images-ng-items-managing-your-products', 'payment-methods-management'],
  bigger_orders: [],
  regulars: [],
  faster_counter: ['introduction-sa-pos-walk-in-orders', 'connecting-sa-printer'],
}

export interface MustWatchInput {
  goals: readonly GoalId[]
  /** Lessons attached to the owner's current Start-here step. */
  currentStepLessons: readonly string[]
  /** Slugs that are published right now. */
  published: ReadonlySet<string>
  watched: ReadonlySet<string>
}

export interface MustWatch {
  slug: string
  isWatched: boolean
}

/**
 * Up to four lessons: unwatched ones first in priority order, then — so the
 * row never looks empty to someone who has been diligent — watched ones.
 */
export function pickMustWatch(input: MustWatchInput): MustWatch[] {
  const ordered = [
    ...input.currentStepLessons,
    ...input.goals.flatMap((goal) => FOR_GOAL[goal]),
    ...BASICS,
  ]
  const unique = [...new Set(ordered)].filter((slug) => input.published.has(slug))
  const unwatched = unique.filter((slug) => !input.watched.has(slug))
  const watched = unique.filter((slug) => input.watched.has(slug))
  return [...unwatched, ...watched]
    .slice(0, MUST_WATCH_COUNT)
    .map((slug) => ({ slug, isWatched: input.watched.has(slug) }))
}
