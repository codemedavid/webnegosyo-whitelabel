import type { Metadata } from 'next'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import {
  buildStorefrontFontsHref,
  fontFamiliesForPair,
  resolveFontPair,
} from '@/lib/storefront-theme'

interface StorefrontChrome {
  name: string | null
  fontPair: string | null
}

/**
 * The one tenant read this layout makes.
 *
 * `generateMetadata` and the layout body both need the tenant, and both render
 * in the same request — `cache` collapses them into a single query instead of
 * the two this file used to run (on top of the menu page's own).
 */
const getStorefrontChrome = cache(async (tenantSlug: string): Promise<StorefrontChrome> => {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('tenants')
      .select('name, font_pair')
      .eq('slug', tenantSlug)
      .maybeSingle()

    const tenant = data as { name: string; font_pair: string | null } | null
    return { name: tenant?.name ?? null, fontPair: tenant?.font_pair ?? null }
  } catch {
    return { name: null, fontPair: null }
  }
})

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenant: string }>
}): Promise<Metadata> {
  const { tenant: tenantSlug } = await params
  const { name } = await getStorefrontChrome(tenantSlug)

  // A slug read as words still beats a bare "Menu" for a tenant the read
  // missed — same fallback this had before the read was shared.
  const tenantName = name || tenantSlug.replace(/-/g, ' ')

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
  const { fontPair } = await getStorefrontChrome(tenantSlug)

  // Load the storefront font-pairing typefaces — and only the ones in force.
  // A tenant only sees a pairing when its `font_pair` knob is set; unset
  // tenants keep their existing fonts (the CSS vars simply aren't emitted), so
  // the stylesheet they used to download — five families, seventeen weights —
  // rendered nothing on their page. Tenants that DID pick a pairing paid for
  // the other four pairings' families too.
  //
  // The Branding Studio previews unsaved pairings client-side, where this
  // server read cannot see them; `useStorefrontFontPreview` loads the full set
  // inside that iframe only.
  const fontsHref = buildStorefrontFontsHref(fontFamiliesForPair(resolveFontPair(fontPair)))

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
