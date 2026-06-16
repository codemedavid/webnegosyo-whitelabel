import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCachedTenantBySlug } from '@/lib/cache'
import { getFooterConfig } from '@/lib/footer-utils'
import { FooterContentPage } from '@/components/customer/footer-content-page'

interface PageProps {
  params: Promise<{ tenant: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tenant: tenantSlug } = await params
  const tenant = await getCachedTenantBySlug(tenantSlug)

  if (!tenant) {
    return { title: 'Not Found' }
  }

  return {
    title: `Refund / Cancellation Policy | ${tenant.name}`,
    description: `Refund and cancellation policy for ${tenant.name}.`,
  }
}

export default async function RefundPage({ params }: PageProps) {
  const { tenant: tenantSlug } = await params
  const tenant = await getCachedTenantBySlug(tenantSlug)
  if (!tenant) notFound()

  const config = getFooterConfig(tenant as unknown as Record<string, unknown>)
  const content = config.content.refundPolicy
  if (!config.enabled || !content) notFound()

  return (
    <FooterContentPage
      tenant={tenant}
      title="Refund / Cancellation Policy"
      content={content}
    />
  )
}
