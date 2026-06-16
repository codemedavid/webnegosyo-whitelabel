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

export const MinimalHeader = memo(function MinimalHeader({
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
        <div className="flex h-14 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {config.showLogo && (
              <HeaderLogo
                tenant={tenant}
                tenantSlug={tenantSlug}
                branding={branding}
                shape={config.logoShape}
                size="sm"
              />
            )}
            {config.showName && (
              <HeaderTitle
                name={name}
                titleColor={branding.menuMainHeaderText}
                taglineColor={config.taglineColor || branding.menuMainHeaderSubtitle}
                size="sm"
              />
            )}
            <HeaderAdminPencil
              visible={isBrandAdmin}
              onClick={() => onEditSection('main_header')}
              label="Edit main header"
            />
          </div>

          <div className="flex flex-shrink-0 items-center gap-3">
            {config.showSearch && (
              <div className="hidden w-44 sm:block">
                <HeaderSearch value={searchQuery} onChange={onSearchChange} branding={branding} />
              </div>
            )}
            {config.showCart && (
              <HeaderCartButton itemCount={itemCount} onClick={onCartClick} branding={branding} />
            )}
            <HeaderAdminPencil
              visible={isBrandAdmin}
              onClick={() => onEditSection('cart_badge')}
              label="Edit cart badge"
            />
          </div>
        </div>

        {config.showSearch && (
          <div className="pb-3 sm:hidden">
            <HeaderSearch value={searchQuery} onChange={onSearchChange} branding={branding} />
          </div>
        )}
      </div>
    </header>
  )
})
