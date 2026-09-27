import { StorefrontFontLinks } from '@/components/customer/storefront-font-links'

// Same storefront typefaces as the menu. A route group, so this layout (and
// the loading screen beside it) wraps only the home page, never admin routes.
export default async function HomeLayout({
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
