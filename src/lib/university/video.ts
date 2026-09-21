/**
 * Hosted-video resolution for University lessons.
 *
 * An author pastes the page url of a YouTube, Vimeo or Loom video; the
 * lesson page needs the matching player url. Only https page urls on the
 * three known hosts resolve, so a lesson can never embed an arbitrary origin
 * in an iframe. YouTube and Vimeo parsing is shared with the "What's New"
 * content model; Loom is University-only.
 */
import { resolveVideoEmbed } from '@/lib/announcements/blocks'

export type LessonVideoProvider = 'youtube' | 'vimeo' | 'loom'

export interface LessonVideo {
  provider: LessonVideoProvider
  videoId: string
  /** The iframe src to play the video in place. */
  embedUrl: string
  /** The canonical page to open on the provider's site. */
  watchUrl: string
  /** A still to show before play; null when the provider offers none we can guess. */
  thumbnailUrl: string | null
}

export const VIDEO_PROVIDER_LABEL: Record<LessonVideoProvider, string> = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  loom: 'Loom',
}

const LOOM_ID = /^[a-f0-9]{32}$/i

function loomIdFrom(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, '')
  if (host !== 'loom.com') return null
  const match = url.pathname.match(/^\/(?:share|embed)\/([^/?]+)/)
  return match ? match[1] : null
}

/** The hosted video a link points at, or null when it is not one we can embed. */
export function resolveLessonVideo(input: string): LessonVideo | null {
  const shared = resolveVideoEmbed(input)
  if (shared?.provider === 'youtube') {
    return {
      provider: 'youtube',
      videoId: shared.videoId,
      embedUrl: `https://www.youtube-nocookie.com/embed/${shared.videoId}?rel=0`,
      watchUrl: shared.watchUrl,
      thumbnailUrl: shared.thumbnailUrl,
    }
  }
  if (shared?.provider === 'vimeo') {
    return {
      provider: 'vimeo',
      videoId: shared.videoId,
      embedUrl: `https://player.vimeo.com/video/${shared.videoId}`,
      watchUrl: shared.watchUrl,
      thumbnailUrl: null,
    }
  }

  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null

  const loomId = loomIdFrom(url)
  if (loomId && LOOM_ID.test(loomId)) {
    return {
      provider: 'loom',
      videoId: loomId,
      embedUrl: `https://www.loom.com/embed/${loomId}`,
      watchUrl: `https://www.loom.com/share/${loomId}`,
      thumbnailUrl: null,
    }
  }

  return null
}
