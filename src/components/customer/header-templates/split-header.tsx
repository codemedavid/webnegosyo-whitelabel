'use client'

import { memo } from 'react'
import {
  type HeaderTemplateProps,
  HeaderLogo,
  HeaderTitle,
  HeaderCartButton,
  HeaderSearch,
  headerShellClass,
  headerShellStyle,
  rowHeightClass,
  HEADER_SCOPE_PROPS,
} from './header-parts'

export const SplitHeader = memo(function SplitHeader({
  tenant,
  tenantSlug,
  branding,
  config,
  itemCount,
  onCartClick,
  searchQuery,
  onSearchChange,
  className,
}: HeaderTemplateProps) {
  const name = tenant?.name || tenantSlug.replace(/-/g, ' ')

  return (
    <header {...HEADER_SCOPE_PROPS} className={headerShellClass(config, className)} style={headerShellStyle(branding)}>
      <div className="container mx-auto px-4">
        <div className={`flex ${rowHeightClass(config.height)} items-center gap-4`}>
          <div className="flex min-w-0 items-center gap-3">
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
              />
            )}
          </div>

          {/* Center search occupies the remaining space on larger screens. */}
          {config.showSearch && (
            <div className="hidden flex-1 justify-center md:flex">
              <div className="w-full max-w-md">
                <HeaderSearch value={searchQuery} onChange={onSearchChange} branding={branding} />
              </div>
            </div>
          )}

          <div className="ml-auto flex flex-shrink-0 items-center gap-2">
            {config.showCart && (
              <HeaderCartButton itemCount={itemCount} onClick={onCartClick} branding={branding} />
            )}
          </div>
        </div>

        {config.showSearch && (
          <div className="pb-3 md:hidden">
            <HeaderSearch value={searchQuery} onChange={onSearchChange} branding={branding} />
          </div>
        )}
      </div>
    </header>
  )
})
