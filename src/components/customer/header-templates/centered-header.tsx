'use client'

import { memo } from 'react'
import {
  type HeaderTemplateProps,
  HeaderLogo,
  HeaderTitle,
  HeaderCartButton,
  HeaderSearch,
  HeaderAdminPencil,
  headerShellClass,
  headerShellStyle,
  rowHeightClass,
} from './header-parts'

export const CenteredHeader = memo(function CenteredHeader({
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

  return (
    <header className={headerShellClass(config, className)} style={headerShellStyle(branding)}>
      <div className="container mx-auto px-4">
        {/* px-20 reserves room on both sides so the centered brand never slides
            under the absolutely-positioned cart on the same line. */}
        <div className={`relative flex ${rowHeightClass(config.height)} flex-col items-center justify-center px-20`}>
          <div className="flex min-w-0 max-w-full items-center gap-3">
            {config.showLogo && (
              <HeaderLogo
                tenant={tenant}
                tenantSlug={tenantSlug}
                branding={branding}
                shape={config.logoShape}
              />
            )}
            {config.showName && (
              <HeaderTitle
                name={name}
                tagline={config.tagline}
                taglineColor={config.taglineColor || branding.menuMainHeaderSubtitle}
                titleColor={branding.menuMainHeaderText}
                align="center"
              />
            )}
            <HeaderAdminPencil
              visible={isBrandAdmin}
              onClick={() => onEditSection('main_header')}
              label="Edit main header"
            />
          </div>

          {(config.showCart || isBrandAdmin) && (
            <div className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center gap-2">
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
        </div>

        {config.showSearch && (
          <div className="mx-auto max-w-md pb-3">
            <HeaderSearch value={searchQuery} onChange={onSearchChange} branding={branding} />
          </div>
        )}
      </div>
    </header>
  )
})
