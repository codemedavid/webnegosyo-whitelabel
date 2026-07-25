import {
  resolveBackgroundOverlay,
  buildBackgroundImageStyle,
  buildBackgroundOverlayStyle,
} from '@/lib/background-overlay'

interface BackgroundOverlayLayerProps {
  tenant: Record<string, unknown> | null | undefined
}

/**
 * Custom storefront background: the merchant's image plus an optional tint,
 * pinned behind the page content.
 *
 * Both layers are `position: fixed` with `z-index: -1`, which paints them above
 * the parent's background color but below every in-flow child — so no existing
 * content needs a z-index bump. They are decorative: hidden from assistive tech
 * and transparent to pointer events. Renders nothing when the tenant has not
 * configured a background, keeping this a no-op for every existing storefront.
 */
export function BackgroundOverlayLayer({ tenant }: BackgroundOverlayLayerProps) {
  const background = resolveBackgroundOverlay(tenant)

  if (!background.isVisible) return null

  const baseLayerStyle = {
    position: 'fixed' as const,
    inset: 0,
    zIndex: -1,
    pointerEvents: 'none' as const,
  }

  return (
    <>
      {background.hasImage && (
        <div
          data-testid="background-image-layer"
          aria-hidden="true"
          style={{ ...baseLayerStyle, ...buildBackgroundImageStyle(background) }}
        />
      )}
      {background.hasOverlay && (
        <div
          data-testid="background-overlay-layer"
          aria-hidden="true"
          style={{ ...baseLayerStyle, ...buildBackgroundOverlayStyle(background) }}
        />
      )}
    </>
  )
}
