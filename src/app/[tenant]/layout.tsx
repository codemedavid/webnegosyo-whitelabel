import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getStorefrontTenant } from '@/lib/storefront/storefront-tenant'
import { NavigationProgress } from '@/components/shared/navigation-progress'
import { SiteFooter } from '@/components/customer/site-footer'
import { TenantFlashProvider } from '@/components/customer/flash-screen-loader'
import { resolveFlashScreenBranding } from '@/lib/flash-loader'
import { resolveTenantFavicon } from '@/lib/tenant-favicon'
import { omitTenantSecrets } from '@/lib/tenant-public'

type Props = {
    params: Promise<{ tenant: string }>
    children: React.ReactNode
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { tenant: tenantSlug } = await params

    const { tenant } = await getStorefrontTenant(tenantSlug)

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
        // Use the merchant's own logo as the browser-tab favicon; falls back to
        // the platform favicon.ico when the tenant has no logo.
        icons: resolveTenantFavicon(tenant),
    }
}

export default async function TenantLayout({ params, children }: Props) {
    const { tenant: tenantSlug } = await params
    // Shared with the menu layout and page: one cached read, no per-request
    // query. A failed read renders the chrome without branding rather than
    // crashing the route — the page body reports the failure.
    const { tenant } = await getStorefrontTenant(tenantSlug)
    const primaryColor = (tenant?.primary_color as string) || undefined
    // Resolve the branded flash loading state once (we have the tenant here) so
    // every route-level loading.tsx can pick it up via context without needing
    // access to route params. `null` when the tenant hasn't enabled the flash.
    const flashBranding = resolveFlashScreenBranding(tenant)

    return (
        <TenantFlashProvider branding={flashBranding}>
            <Suspense fallback={null}>
                <NavigationProgress color={primaryColor} />
            </Suspense>
            {children}
            <SiteFooter tenant={omitTenantSecrets(tenant)} />
        </TenantFlashProvider>
    )
}
