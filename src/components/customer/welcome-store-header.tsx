'use client'

import { HeaderLogo, HeaderTitle } from '@/components/customer/header-templates/header-parts'
import { getTenantBranding } from '@/lib/branding-utils'
import { getHeaderConfig } from '@/lib/header-templates'
import type { Tenant } from '@/types/database'

interface WelcomeStoreHeaderProps {
  tenant: Tenant | null
  /** Fallback initial when the tenant has no logo and no name. */
  tenantSlug?: string
}

/**
 * The storefront's branded bar, brought to the WELCOME page.
 *
 * Same pieces the menu header is built from — logo, store name, tagline on the
 * header colour — so a merchant's welcome page is recognisably the same shop as
 * the menu it leads into, and every Branding Studio header setting (logo shape,
 * tagline, colours) carries over for free.
 *
 * Two deliberate differences from the menu header:
 *  - always centred, whatever header template the storefront uses; this bar is
 *    the page's crown, not a navigation strip with a left-hand brand.
 *  - no cart and no search. The welcome page comes BEFORE the menu, so there is
 *    nothing to search and nothing in the cart worth opening.
 *
 * Not sticky either: the welcome page does not scroll far enough to need it.
 */
export function WelcomeStoreHeader({ tenant, tenantSlug = '' }: WelcomeStoreHeaderProps) {
  const branding = getTenantBranding(tenant)
  const config = getHeaderConfig(tenant)
  const name = tenant?.name ?? ''

  return (
    <header
      data-testid="welcome-store-header"
      data-branding-scope="storefront/header"
      className="-mx-5 -mt-7 mb-1 flex items-center justify-center gap-3 border-b px-5 py-4"
      style={{
        backgroundColor: branding.header,
        color: branding.headerFont,
        borderColor: branding.border,
      }}
    >
      {config.showLogo && (
        <HeaderLogo
          tenant={tenant}
          tenantSlug={tenantSlug}
          branding={branding}
          shape={config.logoShape}
        />
      )}
      {config.showName && name && (
        <HeaderTitle
          name={name}
          tagline={config.tagline}
          taglineColor={config.taglineColor || branding.headerFont}
          titleColor={branding.headerFont}
          align="left"
        />
      )}
    </header>
  )
}
