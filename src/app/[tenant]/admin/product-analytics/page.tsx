import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProductAnalyticsWrapper } from '@/components/admin/product-analytics-wrapper'

interface ProductAnalyticsPageProps {
  params: Promise<{ tenant: string }>
}

export default async function ProductAnalyticsPage({ params }: ProductAnalyticsPageProps) {
  const { tenant } = await params
  const supabase = await createClient()

  const { data: tenantData } = await supabase
    .from('tenants')
    .select('id, convex_deployment_url, menu_engineering_enabled')
    .eq('slug', tenant)
    .single()

  if (!tenantData?.menu_engineering_enabled) {
    redirect(`/${tenant}/admin`)
  }

  if (!tenantData?.convex_deployment_url) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Product Analytics</h1>
        <p className="text-muted-foreground mt-2">
          Product analytics requires Convex to be configured for this tenant.
          Please contact support to enable real-time features.
        </p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <ProductAnalyticsWrapper convexUrl={tenantData.convex_deployment_url} />
    </div>
  )
}
