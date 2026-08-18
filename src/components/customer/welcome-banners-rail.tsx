'use client'

import type { WelcomeBanner } from '@/lib/outlets/welcome-page'

interface WelcomeBannersRailProps {
  /** Already normalized — callers run normalizeWelcomeBanners first. */
  banners: readonly WelcomeBanner[]
}

/**
 * Promo banners on the multi-branch welcome page.
 *
 * Landscape banners take the full column width, stacked — they are the hero
 * shots. Portrait and square banners share one horizontal snap-scroll rail of
 * fixed-height cards, so a merchant can mix formats without the page turning
 * into a ragged collage: wide imagery reads first, tall imagery browses
 * sideways like stories.
 */
export function WelcomeBannersRail({ banners }: WelcomeBannersRailProps) {
  if (banners.length === 0) return null

  const landscape = banners.filter((banner) => banner.format === 'landscape')
  const railed = banners.filter((banner) => banner.format !== 'landscape')

  return (
    <div className="flex flex-col gap-4">
      {landscape.map((banner) => (
        <figure key={banner.id} className="overflow-hidden rounded-2xl shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={banner.imageUrl}
            alt={banner.title ?? ''}
            className="aspect-video w-full object-cover"
          />
          {(banner.title || banner.description) && (
            <figcaption className="px-4 py-3">
              {banner.title && <span className="block text-sm font-bold">{banner.title}</span>}
              {banner.description && (
                <span className="block text-xs text-muted-foreground">{banner.description}</span>
              )}
            </figcaption>
          )}
        </figure>
      ))}

      {railed.length > 0 && (
        <div
          data-testid="welcome-banners-rail"
          className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none]"
        >
          {railed.map((banner) => (
            <figure
              key={banner.id}
              className={`relative shrink-0 snap-start overflow-hidden rounded-2xl shadow-sm ${
                banner.format === 'portrait' ? 'aspect-[3/4] w-44' : 'aspect-square w-44'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={banner.imageUrl}
                alt={banner.title ?? ''}
                className="h-full w-full object-cover"
              />
              {(banner.title || banner.description) && (
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2.5 pt-8 text-white">
                  {banner.title && <span className="block text-xs font-bold">{banner.title}</span>}
                  {banner.description && (
                    <span className="block text-[11px] opacity-90">{banner.description}</span>
                  )}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      )}
    </div>
  )
}
