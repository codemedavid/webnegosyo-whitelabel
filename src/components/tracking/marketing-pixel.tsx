import { MetaPixelBootstrap } from './meta-pixel-bootstrap'

/**
 * The platform's own Meta pixel, for the platform's own marketing pages: the
 * homepage, /funnel and /checkout. Mounted per page, never in the root layout.
 *
 * Until 2026-11-10 it sat in the root layout, so it fired on every merchant
 * storefront (subdomains and custom domains), the tenant admin and superadmin:
 * about 73% of its events were diners at our merchants' stores, which filled
 * our ad audiences with the wrong people and tracked our merchants' customers
 * under our name. `tests/unit/components/marketing-pixel-scope.test.ts` keeps
 * it out of the root layout.
 */
export function MarketingPixel() {
  return <MetaPixelBootstrap pixelId={process.env.NEXT_PUBLIC_META_PIXEL_ID} />
}
