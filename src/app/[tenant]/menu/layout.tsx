import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { buildStorefrontFontsHref } from '@/lib/storefront-theme'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenant: string }>
}): Promise<Metadata> {
  const { tenant: tenantSlug } = await params

  try {
    const supabase = await createClient()
    const { data: tenantData } = await supabase
      .from('tenants')
      .select('name')
      .eq('slug', tenantSlug)
      .maybeSingle()

    const tenant = tenantData as { name: string } | null
    const tenantName = tenant?.name || tenantSlug.replace(/-/g, ' ')

    return {
      title: `Menu | ${tenantName}`,
      description: `Browse the menu and order from ${tenantName}`,
    }
  } catch {
    return {
      title: 'Menu',
      description: 'Browse our menu and order your favorite dishes',
    }
  }
}

export default function MenuLayout({ children }: { children: React.ReactNode }) {
  // Load the storefront font-pairing typefaces. A tenant only sees them when its
  // `font_pair` knob is set; unset tenants keep their existing fonts (the CSS
  // vars simply aren't emitted), so this is safe to load once for the storefront.
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={buildStorefrontFontsHref()} />
      {children}
    </>
  )
}
