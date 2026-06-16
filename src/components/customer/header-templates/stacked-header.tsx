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
} from './header-parts'

export const StackedHeader = memo(function StackedHeader({
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
  const verticalPad = config.height === 'compact' ? 'py-2.5' : config.height === 'tall' ? 'py-6' : 'py-4'

  return (
    <header className={headerShellClass(config, className)} style={headerShellStyle(branding)}>
      <div className="container relative mx-auto px-4">
        {(config.showCart || isBrandAdmin) && (
          <div className="absolute right-4 top-3 flex items-center gap-2">
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
        <div className={`flex flex-col items-center gap-1.5 px-20 text-center ${verticalPad}`}>
          {config.showLogo && (
            <HeaderLogo
              tenant={tenant}
              tenantSlug={tenantSlug}
              branding={branding}
              shape={config.logoShape}
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
                />
              )}
              <HeaderAdminPencil
                visible={isBrandAdmin}
                onClick={() => onEditSection('main_header')}
                label="Edit main header"
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
