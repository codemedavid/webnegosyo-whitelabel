import { getStorefrontTenant } from '@/lib/storefront/storefront-tenant'
import { buildStorefrontFontsHref, fontFamiliesForPair, resolveFontPair } from '@/lib/storefront-theme'

/**
 * Google Fonts links for the tenant's storefront typefaces — only the ones in
 * force. A tenant only gets a pairing when its `font_pair` knob is set; unset
 * tenants keep their existing fonts (the CSS vars simply aren't emitted).
 *
 * Reads the same cached tenant entry as the tenant layout and pages. The
 * Branding Studio previews unsaved pairings client-side, where this server read
 * cannot see them; `useStorefrontFontPreview` loads the full set inside that
 * iframe only.
 */
export async function StorefrontFontLinks({ tenantSlug }: { tenantSlug: string }) {
  const { tenant } = await getStorefrontTenant(tenantSlug)
  const fontsHref = buildStorefrontFontsHref(fontFamiliesForPair(resolveFontPair(tenant?.font_pair ?? null)))
  if (!fontsHref) return null

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={fontsHref} />
    </>
  )
}
