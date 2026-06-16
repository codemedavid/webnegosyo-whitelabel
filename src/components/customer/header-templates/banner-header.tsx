'use client'

import { memo } from 'react'
import { setAlpha } from '@/lib/branding-utils'
import {
  type HeaderTemplateProps,
  HeaderLogo,
  HeaderTitle,
  HeaderCartButton,
  HeaderSearch,
  HeaderAdminPencil,
  headerShellClass,
} from './header-parts'

export const BannerHeader = memo(function BannerHeader({
  tenant,
  tenantSlug,
  branding,
  config,
  itemCount,
  onCartClick,
  searchQuery,
  onSearchChange,
  isBrandAdmin,
  onEditSection,
  className,
}: HeaderTemplateProps) {
  const name = tenant?.name || tenantSlug.replace(/-/g, ' ')

  // Vertical band scales with the "Header height" control (banner is content-driven,
  // so it uses padding rather than the fixed rowHeightClass heights).
  const bannerPad =
    config.height === 'compact' ? 'py-6' : config.height === 'tall' ? 'py-12 sm:py-16' : 'py-8 sm:py-12'

  // Subtle brand gradient: header color blended into a soft primary tint.
  const background = `linear-gradient(160deg, ${branding.header} 0%, ${setAlpha(branding.primary, 0.14)} 100%)`

  return (
    <header
      className={headerShellClass(config, className)}
      style={{ background, color: branding.headerFont, borderColor: branding.border }}
    >
      <div className="container relative mx-auto px-4">
        {(config.showCart || isBrandAdmin) && (
          <div className="absolute right-4 top-4 flex items-center gap-2">
            {config.showCart && (
              <HeaderCartButton itemCount={itemCount} onClick={onCartClick} branding={branding} />
            )}
            <HeaderAdminPencil
              visible={isBrandAdmin}
              onClick={() => onEditSection('cart_badge')}
              label="Edit cart badge"
            />
          </div>
        )}

        {/* px-20 keeps the centered brand clear of the top-right cart/pencil. */}
        <div className={`flex flex-col items-center gap-3 px-20 text-center ${bannerPad}`}>
          {config.showLogo && (
            <HeaderLogo
              tenant={tenant}
              tenantSlug={tenantSlug}
              branding={branding}
              shape={config.logoShape}
              size="lg"
            />
          )}
          {(config.showName || isBrandAdmin) && (
            <div className="flex min-w-0 max-w-full items-center gap-2">
              {config.showName && (
                <HeaderTitle
                  name={name}
                  tagline={config.tagline}
                  taglineColor={config.taglineColor || branding.menuMainHeaderSubtitle}
                  titleColor={branding.menuMainHeaderText}
                  align="center"
                  size="lg"
                />
              )}
              <HeaderAdminPencil
                visible={isBrandAdmin}
                onClick={() => onEditSection('main_header')}
                label="Edit main header"
                className="mt-1"
              />
            </div>
          )}
          {config.showSearch && (
            <div className="mt-2 w-full max-w-md">
              <HeaderSearch value={searchQuery} onChange={onSearchChange} branding={branding} />
            </div>
          )}
        </div>
      </div>
    </header>
  )
})
