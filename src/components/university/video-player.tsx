import { resolveLessonVideo } from '@/lib/university/video'

/**
 * The lesson's hosted video, played in place. Only urls the resolver accepts
 * become an iframe, so the src is always one of the three provider hosts.
 */
export function VideoPlayer({ url, title }: { url: string; title: string }) {
  const video = resolveLessonVideo(url)
  if (!video) return null
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-[0_30px_60px_-30px_rgba(28,22,19,0.6)]">
      <iframe
        src={video.embedUrl}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        loading="lazy"
        className="absolute inset-0 h-full w-full"
      />
    </div>
  )
}
