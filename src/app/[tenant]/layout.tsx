import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getCachedTenantBySlug } from '@/lib/cache'
import { NavigationProgress } from '@/components/shared/navigation-progress'
import { SiteFooter } from '@/components/customer/site-footer'

type Props = {
    params: Promise<{ tenant: string }>
    children: React.ReactNode
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { tenant: tenantSlug } = await params

    // Fetch tenant data
    const tenant = await getCachedTenantBySlug(tenantSlug)

    if (!tenant) {
        return {
            title: 'Not Found',
        }
    }

    return {
        title: {
            default: tenant.name,
            template: `%s | ${tenant.name}`,
        },
        description: tenant.hero_description || `Welcome to ${tenant.name}`,
    }
}

export default async function TenantLayout({ params, children }: Props) {
    const { tenant: tenantSlug } = await params
    const tenant = await getCachedTenantBySlug(tenantSlug)
    const primaryColor = (tenant?.primary_color as string) || undefined

    return (
        <>
            <Suspense fallback={null}>
                <NavigationProgress color={primaryColor} />
            </Suspense>
            {children}
            <SiteFooter tenant={tenant} />
        </>
    )
}
