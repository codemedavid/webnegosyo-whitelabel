/* eslint-disable @next/next/no-img-element */
import { generateImageSrcSet, transformImageUrl } from '@/lib/imagekit-utils'

/** Widths the CDN is asked for; the largest covers a retina course hero. */
const COVER_WIDTHS = [320, 480, 640, 960, 1280, 1920]

/** Fallback `src` width for a browser that ignores `srcSet`. */
const DEFAULT_COVER_WIDTH = 960

interface Props {
  url: string
  /** `sizes` for the slot this cover fills — a card column, or the full hero. */
  sizes: string
  className?: string
  /** The catalog's first cards and the course hero are above the fold. */
  priority?: boolean
}

/**
 * A course cover, served at the size it is actually drawn at.
 *
 * The portal used to render the stored original — a 2000px ImageKit upload
 * behind a 380px card — on both the catalog and the course hero, which is
 * most of what those pages weigh. `transformImageUrl` asks ImageKit (or a
 * legacy Cloudinary URL) for a resized, auto-format variant instead. A cover
 * hosted anywhere else is returned untouched and still renders.
 *
 * This is a plain `img` rather than `next/image` on purpose: the CDN already
 * does the resizing, it ships no client JavaScript, and a cover pasted from an
 * unconfigured host cannot crash the page the way an unallowed `next/image`
 * host does.
 */
export function CourseCover({ url, sizes, className, priority = false }: Props) {
  const src = transformImageUrl(url, { width: DEFAULT_COVER_WIDTH, quality: 'auto', format: 'auto' })
  if (!src) return null
  const srcSet = generateImageSrcSet(url, COVER_WIDTHS)

  return (
    <img
      src={src}
      srcSet={srcSet || undefined}
      sizes={srcSet ? sizes : undefined}
      alt=""
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      className={className}
    />
  )
}
