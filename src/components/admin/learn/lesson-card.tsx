/* eslint-disable @next/next/no-img-element */
import Link from 'next/link'
import { Check, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { resolveLessonVideo } from '@/lib/university/video'
import type { LearnLesson } from '@/lib/university/learn-data'

interface LessonCardProps {
  lesson: LearnLesson
  href: string
  isWatched: boolean
  isMustWatch?: boolean
  /** Why this one: "Your next step", "For bigger orders". */
  note?: string | null
}

/** A lesson as a thumbnail card: the "Watch these first" row. */
export function LessonCard({ lesson, href, isWatched, isMustWatch = false, note = null }: LessonCardProps) {
  const thumbnail = lesson.videoUrl ? resolveLessonVideo(lesson.videoUrl)?.thumbnailUrl ?? null : null
  return (
    <Link
      href={href}
      className={cn(
        'group flex flex-col overflow-hidden rounded-2xl border-2 bg-white transition-[transform,box-shadow] [box-shadow:0_4px_0_var(--color-wn-line)] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wn-coral focus-visible:ring-offset-2',
        'border-wn-line',
      )}
    >
      <span className="relative block aspect-video bg-wn-ink">
        {thumbnail && <img src={thumbnail} alt="" loading="lazy" className={cn('h-full w-full object-cover', isWatched && 'opacity-60')} />}
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#E8B23A] text-wn-ink shadow-[0_6px_16px_rgba(0,0,0,0.35)] transition-transform group-hover:scale-105">
            {isWatched ? <Check className="h-5 w-5" strokeWidth={3} /> : <Play className="h-5 w-5 translate-x-px fill-current" />}
          </span>
        </span>
        {isMustWatch && !isWatched && (
          <span className="absolute left-2 top-2 rounded-md bg-[#E8B23A] px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide text-wn-ink">MUST WATCH</span>
        )}
        {lesson.durationMinutes ? (
          <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-bold text-white">
            {lesson.durationMinutes} min{isWatched ? ' · watched' : ''}
          </span>
        ) : null}
      </span>
      <span className="flex flex-1 flex-col gap-0.5 p-3">
        <span className="line-clamp-2 text-[14px] font-extrabold leading-snug text-wn-ink">{lesson.title}</span>
        {note && <span className="text-[12px] text-wn-stone">{note}</span>}
      </span>
    </Link>
  )
}
