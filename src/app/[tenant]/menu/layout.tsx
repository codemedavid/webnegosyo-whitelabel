import type { Metadata } from 'next'
import { getStorefrontTenant } from '@/lib/storefront/storefront-tenant'
import { StorefrontFontLinks } from '@/components/customer/storefront-font-links'

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
  return (
    <>
      <StorefrontFontLinks tenantSlug={tenantSlug} />
      {children}
    </>
  )
}
