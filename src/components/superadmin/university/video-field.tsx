'use client'

import { Play, Youtube } from 'lucide-react'
import { cn } from '@/lib/utils'
import { resolveLessonVideo, VIDEO_PROVIDER_LABEL } from '@/lib/university/video'

interface Props {
  value: string
  onChange: (value: string) => void
}

const FIELD =
  'w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none'

/**
 * The lesson's hosted video: a url box with a live player underneath. The
 * player only appears once the url resolves to YouTube, Vimeo or Loom, so the
 * author sees exactly what a learner will.
 */
export function VideoField({ value, onChange }: Props) {
  const trimmed = value.trim()
  const video = trimmed ? resolveLessonVideo(trimmed) : null
  const isInvalid = trimmed.length > 0 && !video

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-white/60">
          <Youtube className="h-3.5 w-3.5" />
          Video link
        </span>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Paste a YouTube, Vimeo or Loom link"
          className={cn(FIELD, isInvalid && 'border-amber-400/50')}
          inputMode="url"
        />
        <span className={cn('mt-1 block text-[11px]', isInvalid ? 'text-amber-300' : 'text-white/40')}>
          {video
            ? `${VIDEO_PROVIDER_LABEL[video.provider]} video · plays right on the lesson page`
            : isInvalid
              ? 'Only YouTube, Vimeo and Loom links are supported'
              : 'Optional — leave empty for a text-only lesson'}
        </span>
      </label>

      {video ? (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">
          <div className="relative aspect-video w-full">
            <iframe
              key={video.embedUrl}
              src={video.embedUrl}
              title="Lesson video preview"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
            />
          </div>
          <div className="flex items-center gap-2 px-4 py-2.5 text-[11px] text-white/50">
            <Play className="h-3 w-3" />
            {VIDEO_PROVIDER_LABEL[video.provider]} · {video.watchUrl}
          </div>
        </div>
      ) : null}
    </div>
  )
}
