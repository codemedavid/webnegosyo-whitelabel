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
    title: `About Us | ${tenant.name}`,
    description: `Learn more about ${tenant.name}.`,
  }
}

export default async function AboutPage({ params }: PageProps) {
  const { tenant: tenantSlug } = await params
  const tenant = await getCachedTenantBySlug(tenantSlug)
  if (!tenant) notFound()

  const config = getFooterConfig(tenant as unknown as Record<string, unknown>)
  const content = config.content.aboutUs
  if (!config.enabled || !content) notFound()

  return <FooterContentPage tenant={tenant} title="About Us" content={content} />
}
