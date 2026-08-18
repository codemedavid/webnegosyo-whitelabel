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
 * shots. A lone portrait or square banner does the same: it fills the column
 * and centres, because a single promo squeezed into a narrow card just looks
 * like a mistake. Two or more share one horizontal snap-scroll rail of
 * fixed-height cards (auto margins centre a short rail without clipping the
 * first card when it does overflow), so a merchant can mix formats without the
 * page turning into a ragged collage.
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

      {railed.length === 1 && (
        <figure
          key={railed[0].id}
          data-testid="welcome-banner-solo"
          className={`relative mx-auto w-full overflow-hidden rounded-2xl shadow-sm ${
            railed[0].format === 'portrait' ? 'aspect-[3/4]' : 'aspect-square'
          } max-h-[65vh]`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={railed[0].imageUrl}
            alt={railed[0].title ?? ''}
            className="h-full w-full object-cover"
          />
          {(railed[0].title || railed[0].description) && (
            <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-10 text-white">
              {railed[0].title && (
                <span className="block text-sm font-bold">{railed[0].title}</span>
              )}
              {railed[0].description && (
                <span className="block text-xs opacity-90">{railed[0].description}</span>
              )}
            </figcaption>
          )}
        </figure>
      )}

      {railed.length > 1 && (
        <div
          data-testid="welcome-banners-rail"
          className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&>*:first-child]:ml-auto [&>*:last-child]:mr-auto"
        >
          {railed.map((banner) => (
            <figure
              key={banner.id}
              className={`relative shrink-0 snap-start overflow-hidden rounded-2xl shadow-sm ${
                banner.format === 'portrait' ? 'aspect-[3/4] w-52' : 'aspect-square w-52'
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
