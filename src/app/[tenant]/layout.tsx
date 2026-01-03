import type { Metadata } from 'next'
import { getCachedTenantBySlug } from '@/lib/cache'

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

export default function TenantLayout({ children }: { children: React.ReactNode }) {
    return children
}
