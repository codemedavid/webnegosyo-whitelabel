/**
 * find_lessons — the SmartMenu University lessons (published only) that show
 * how to do what the person asked, with the video to play in the chat.
 * Open to everyone who may use Owl: a lesson is how-to, not store data.
 */

import { z } from 'zod'
import { loadLearnCatalog } from '@/lib/university/learn-data'
import { resolveLessonVideo } from '@/lib/university/video'
import { rankLessons, type LessonCandidate } from '@/lib/assistant/insights/lessons'
import type { AssistantToolDef } from '@/lib/assistant/tools/registry'
import type { LessonsCard, ToolResult } from '@/lib/assistant/types'

const input = z.object({ topic: z.string().trim().min(2).max(200).describe('What the person wants to learn to do, in their words') })
type Input = z.infer<typeof input>

/** Lesson titles the model may name when nothing matched, so it can say what exists. */
const CATALOG_LIMIT = 30

export function lessonPath(lesson: Pick<LessonCandidate, 'courseSlug' | 'slug'>): string {
  return `/learn/${encodeURIComponent(lesson.courseSlug)}/${encodeURIComponent(lesson.slug)}`
}

export function buildLessonsResult(topic: string, lessons: readonly LessonCandidate[]): ToolResult {
  const matches = rankLessons(topic, lessons)
  if (matches.length === 0) {
    return {
      facts: {
        found: 0,
        note: 'No lesson covers this. Say so, and answer from the tools if you can.',
        lessonsAvailable: lessons.slice(0, CATALOG_LIMIT).map((lesson) => lesson.title),
      },
      links: [{ label: 'Browse all lessons', path: '/learn' }],
    }
  }
  const card: LessonsCard = {
    type: 'lessons',
    title: matches.length === 1 ? 'Watch how it works' : 'Lessons that show how',
    lessons: matches.map((lesson) => {
      const video = lesson.videoUrl ? resolveLessonVideo(lesson.videoUrl) : null
      return {
        title: lesson.title,
        detail: [lesson.courseTitle, lesson.durationMinutes ? `${lesson.durationMinutes} min` : null, video ? null : 'read along'].filter(Boolean).join(' · '),
        path: lessonPath(lesson),
        embedUrl: video?.embedUrl ?? null,
        watchUrl: video?.watchUrl ?? null,
        thumbnailUrl: video?.thumbnailUrl ?? null,
      }
    }),
  }
  return {
    facts: {
      found: matches.length,
      lessons: matches.map((lesson) => ({ title: lesson.title, hasVideo: Boolean(lesson.videoUrl), minutes: lesson.durationMinutes })),
      note: 'The lessons show as playable cards. Mention them in one short line; do not list them again.',
    },
    card,
  }
}

export const findLessonsTool: AssistantToolDef<Input> = {
  name: 'find_lessons',
  description: 'SmartMenu University how-to videos for a feature (payment methods, inventory, printer, POS, staff…). Use for "how do I…" questions.',
  // Every Owl user may watch lessons, whatever their other keys.
  access: { public: true },
  input,
  async run(_ctx, { topic }) {
    try {
      const catalog = await loadLearnCatalog()
      const lessons: LessonCandidate[] = catalog.lessons.map((lesson) => ({
        id: lesson.id,
        slug: lesson.slug,
        courseSlug: lesson.courseSlug,
        title: lesson.title,
        summary: lesson.summary,
        moduleTitle: lesson.moduleTitle,
        courseTitle: lesson.courseTitle,
        videoUrl: lesson.videoUrl,
        durationMinutes: lesson.durationMinutes,
      }))
      return buildLessonsResult(topic, lessons)
    } catch (error) {
      console.error('[assistant] lessons could not be read', error instanceof Error ? error.message : String(error))
      return { facts: { available: false, reason: 'Lessons could not be loaded right now.' }, links: [{ label: 'Open Learn', path: '/learn' }] }
    }
  },
}
