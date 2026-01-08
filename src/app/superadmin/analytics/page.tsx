import { Suspense } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { TopActiveTenants } from '@/components/superadmin/analytics/top-active-tenants'
import { getTopActiveTenants, getTotalOrders } from '@/lib/queries/analytics-server'

// Cache the analytics for 60s
export const revalidate = 60

async function AnalyticsContent() {
    // Fetch data for both ranges in parallel
    const [data3d, data7d, totalOrders3d, totalOrders7d] = await Promise.all([
        getTopActiveTenants('3d'),
        getTopActiveTenants('7d'),
        getTotalOrders('3d'),
        getTotalOrders('7d'),
    ])

    return (
        <TopActiveTenants
            initialData3d={data3d}
            initialData7d={data7d}
            totalOrders3d={totalOrders3d}
            totalOrders7d={totalOrders7d}
        />
    )
}

export default function AnalyticsPage() {
    return (
        <div className="space-y-6">
            <Breadcrumbs
                items={[
                    { label: 'Dashboard', href: '/superadmin' },
                    { label: 'Analytics' },
                ]}
            />

            <div>
                <h1 className="text-3xl font-bold">Analytics</h1>
                <p className="text-muted-foreground">Monitor platform activity and top performing restaurants</p>
            </div>

            <Suspense
                fallback={
                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <div className="h-4 w-24 animate-pulse bg-muted rounded" />
                            </CardHeader>
                            <CardContent>
                                <div className="h-8 w-16 animate-pulse bg-muted rounded" />
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <div className="h-6 w-48 animate-pulse bg-muted rounded" />
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {[...Array(5)].map((_, i) => (
                                        <div key={i} className="h-16 w-full animate-pulse bg-muted rounded" />
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                }
            >
                <AnalyticsContent />
            </Suspense>
        </div>
    )
}
