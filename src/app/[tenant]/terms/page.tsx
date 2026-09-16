import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCachedTenantBySlug } from '@/lib/cache'
import { getFooterConfig } from '@/lib/footer-utils'
import { FooterContentPage } from '@/components/customer/footer-content-page'
import { omitTenantSecrets } from '@/lib/tenant-public'

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
    title: 'Terms of Service',
    description: `Terms of Service for ${tenant.name}.`,
  }
}

export default async function TermsPage({ params }: PageProps) {
  const { tenant: tenantSlug } = await params
  const tenant = await getCachedTenantBySlug(tenantSlug)
  if (!tenant) notFound()

  const config = getFooterConfig(tenant as unknown as Record<string, unknown>)
  const content = config.content.termsOfService
  if (!config.enabled || !content) notFound()

  return <FooterContentPage tenant={omitTenantSecrets(tenant)} title="Terms of Service" content={content} />
}
