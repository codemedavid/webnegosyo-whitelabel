'use client'

/**
 * Branded full-screen "flash" (splash) loader.
 *
 * Shared across the storefront so every loading surface (menu, checkout, …)
 * shows the tenant's configured splash instead of a generic spinner. When the
 * tenant isn't available yet the component degrades to a neutral dark splash
 * with the fallback title and the tenant's initial letter.
 */

import type { Tenant } from '@/types/database'

const DEFAULT_BACKGROUND = '#111111'
const DEFAULT_TEXT_COLOR = '#ffffff'

interface FlashScreenProps {
  /** Tenant branding source; null while it is still being fetched. */
  tenant?: Tenant | null
  /**
   * Route slug — used for the initial-letter fallback when no name/logo.
   * Optional: when FlashScreen is used as a next/dynamic loading fallback it
   * receives no props, so it must render without a slug.
   */
  tenantSlug?: string
  /** Title shown when the tenant has no configured flash title. */
  fallbackTitle?: string
}

export function FlashScreen({ tenant, tenantSlug, fallbackTitle = 'Loading menu...' }: FlashScreenProps) {
  const imageUrl = tenant?.flash_screen_image_url || tenant?.logo_url || ''
  const initial = (tenant?.name?.charAt(0) || tenantSlug?.charAt(0) || '?').toUpperCase()
  const title = tenant?.flash_screen_title || fallbackTitle

  return (
    <div
      data-testid="flash-screen"
      className="fixed inset-0 z-[120] flex items-center justify-center px-6"
      style={{
        backgroundColor: tenant?.flash_screen_background_color || DEFAULT_BACKGROUND,
        color: tenant?.flash_screen_text_color || DEFAULT_TEXT_COLOR,
      }}
    >
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        {imageUrl ? (
          <div className="mb-6 h-24 w-24 overflow-hidden rounded-full border border-white/20 bg-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={tenant?.name || 'Brand logo'}
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full border border-white/20 bg-white/10 text-3xl font-bold">
            {initial}
          </div>
        )}

        <h2 className="text-2xl font-semibold">{title}</h2>

        {tenant?.flash_screen_subtitle && (
          <p className="mt-2 text-sm opacity-90">{tenant.flash_screen_subtitle}</p>
        )}

        <div
          className="mt-8 h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-label="Loading"
        />
      </div>
    </div>
  )
}
