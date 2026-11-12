'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, GraduationCap, Play } from 'lucide-react'
import { VideoPlayer } from '@/components/university/video-player'
import type { LessonsCard } from '@/lib/assistant/types'

interface LessonsCardViewProps {
  card: LessonsCard
  adminBasePath: string
  onNavigate?: () => void
}

/** Admin-relative lesson paths only: a stored card can never link off the admin. */
function isLessonPath(path: unknown): path is string {
  return typeof path === 'string' && /^\/learn\/[A-Za-z0-9%_-]+\/[A-Za-z0-9%_-]+$/.test(path)
}

/**
 * University lessons Owl found. The first video plays right in the chat; the
 * player re-resolves the URL itself, so only YouTube / Vimeo / Loom ever
 * become an iframe, whatever a stored card holds.
 */
export function LessonsCardView({ card, adminBasePath, onNavigate }: LessonsCardViewProps) {
  const lessons = Array.isArray(card.lessons) ? card.lessons.filter((lesson) => isLessonPath(lesson.path)) : []
  const [playing, setPlaying] = useState(0)
  if (lessons.length === 0) return null

  return (
    <section className="rounded-2xl bg-white ring-1 ring-border">
      <header className="flex items-center gap-1.5 px-4 pb-2 pt-3">
        <GraduationCap className="h-4 w-4 text-amber-700" aria-hidden />
        <h3 className="text-[13px] font-extrabold tracking-[-0.01em]">{card.title}</h3>
      </header>
      <ol className="space-y-2 px-4 pb-4">
        {lessons.map((lesson, index) => {
          const canPlay = Boolean(lesson.watchUrl)
          return (
            <li key={lesson.path} className="space-y-1.5">
              {canPlay && playing === index ? (
                <VideoPlayer url={lesson.watchUrl as string} title={lesson.title} className="rounded-xl shadow-none" />
              ) : null}
              <div className="flex items-center gap-2">
                {canPlay && playing !== index ? (
                  <button
                    type="button"
                    onClick={() => setPlaying(index)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white"
                    aria-label={`Play ${lesson.title}`}
                  >
                    <Play className="h-3.5 w-3.5" aria-hidden />
                  </button>
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold">{lesson.title}</p>
                  {lesson.detail ? <p className="truncate text-[11px] text-muted-foreground">{lesson.detail}</p> : null}
                </div>
                <Link
                  href={`${adminBasePath}${lesson.path}`}
                  onClick={onNavigate}
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold underline-offset-2 hover:underline"
                >
                  Open
                  <ArrowRight className="h-3 w-3" aria-hidden />
                </Link>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
