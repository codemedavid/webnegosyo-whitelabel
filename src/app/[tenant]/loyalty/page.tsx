import { notFound } from 'next/navigation'
import { getCachedTenantBySlug } from '@/lib/cache'
import { LoyaltyWalletPage } from '@/components/customer/loyalty-wallet-page'
export const metadata = {
  title: 'Your loyalty rewards',
  robots: { index: false, follow: false },
}
export default async function LoyaltyPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: slug } = await params
  const tenant = await getCachedTenantBySlug(slug)
  if (!tenant) notFound()
  return (
    <LoyaltyWalletPage
      tenantId={tenant.id}
      tenantSlug={slug}
      storeName={tenant.name}
    />
  )
}
