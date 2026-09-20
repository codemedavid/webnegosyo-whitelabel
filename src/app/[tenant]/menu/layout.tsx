import type { Metadata } from 'next'
import { getStorefrontTenant } from '@/lib/storefront/storefront-tenant'
import {
  buildStorefrontFontsHref,
  fontFamiliesForPair,
  resolveFontPair,
} from '@/lib/storefront-theme'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenant: string }>
}): Promise<Metadata> {
  const { tenant: tenantSlug } = await params
  const { tenant } = await getStorefrontTenant(tenantSlug)

  // A slug read as words still beats a bare "Menu" for a tenant the read
  // missed.
  const tenantName = tenant?.name || tenantSlug.replace(/-/g, ' ')

  return {
    title: 'Menu',
    description: `Browse the menu and order from ${tenantName}`,
  }
}

export default async function MenuLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params
  // The same cached tenant read the tenant layout and the menu page use —
  // this layout used to run its own `name, font_pair` query per request.
  const { tenant } = await getStorefrontTenant(tenantSlug)

  // Load the storefront font-pairing typefaces — and only the ones in force.
  // A tenant only sees a pairing when its `font_pair` knob is set; unset
  // tenants keep their existing fonts (the CSS vars simply aren't emitted).
  //
  // The Branding Studio previews unsaved pairings client-side, where this
  // server read cannot see them; `useStorefrontFontPreview` loads the full set
  // inside that iframe only.
  const fontsHref = buildStorefrontFontsHref(fontFamiliesForPair(resolveFontPair(tenant?.font_pair ?? null)))

  if (!fontsHref) return <>{children}</>

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={fontsHref} />
      {children}
    </>
  )
}
