import { Suspense } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Store, ShoppingBag, Zap, Package, ArrowRight, CircleDot } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getTenants } from '@/lib/queries/tenants-server'
import { getTotalOrders } from '@/lib/queries/analytics-server'
import { BulkDeployButton } from '@/components/superadmin/bulk-deploy-button'

// Cache the dashboard for 60s to avoid repeated DB hits on navigation
export const revalidate = 60

async function DashboardStats() {
  const [{ data: tenants }, orders7d, orders3d] = await Promise.all([
    getTenants({ pageSize: 1000 }),
    getTotalOrders('7d'),
    getTotalOrders('3d'),
  ])

  const totalTenants = tenants.length
  const activeTenants = tenants.filter((t) => t.is_active).length
  const inactiveTenants = totalTenants - activeTenants
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const withMenuEng = tenants.filter((t: any) => t.menu_engineering_enabled).length
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const withApp = tenants.filter((t: any) => t.app_enabled).length

  const stats = [
    {
      title: 'Restaurants',
      value: totalTenants,
      description: `${activeTenants} active, ${inactiveTenants} inactive`,
      icon: Store,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-950',
    },
    {
      title: 'Orders (7d)',
      value: orders7d,
      description: `${orders3d} in last 3 days`,
      icon: ShoppingBag,
      color: 'text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-50 dark:bg-emerald-950',
    },
    {
      title: 'Menu Engineering',
      value: withMenuEng,
      description: `of ${totalTenants} tenants enabled`,
      icon: Zap,
      color: 'text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-50 dark:bg-amber-950',
    },
    {
      title: 'Mobile Apps',
      value: withApp,
      description: `of ${totalTenants} tenants deployed`,
      icon: Package,
      color: 'text-violet-600 dark:text-violet-400',
      bgColor: 'bg-violet-50 dark:bg-violet-950',
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => {
        const Icon = stat.icon
        return (
          <Card key={stat.title} className="relative overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
              <div className={`rounded-lg p-2 ${stat.bgColor}`}>
                <Icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tracking-tight">{stat.value}</div>
              <p className="mt-1 text-xs text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

async function RecentTenants() {
  const { data: tenants } = await getTenants({ pageSize: 8 })
  const recentTenants = tenants

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Recent Restaurants</CardTitle>
          <CardDescription>Latest added restaurants on the platform</CardDescription>
        </div>
        <Link href="/superadmin/tenants">
          <Button variant="outline" size="sm">
            View all
            <ArrowRight className="ml-2 h-3 w-3" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {recentTenants.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Store className="mb-4 h-12 w-12 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">No restaurants yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add your first restaurant to get started
            </p>
            <Link href="/superadmin/tenants/new" className="mt-4">
              <Button size="sm">Add Restaurant</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {recentTenants.map((tenant) => (
              <Link key={tenant.id} href={`/superadmin/tenants/${tenant.id}`}>
                <div className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50">
                  <div className="flex items-center gap-3">
                    {tenant.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={tenant.logo_url}
                        alt={tenant.name}
                        className="h-9 w-9 rounded-lg object-cover"
                      />
                    ) : (
                      <div
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold text-white"
                        style={{ backgroundColor: tenant.primary_color || '#6366f1' }}
                      >
                        {tenant.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <h3 className="text-sm font-medium">{tenant.name}</h3>
                      <p className="text-xs text-muted-foreground">/{tenant.slug}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {tenant.domain && (
                      <span className="hidden text-xs text-muted-foreground sm:inline">
                        {tenant.domain}
                      </span>
                    )}
                    <div className="flex items-center gap-1.5">
                      <CircleDot
                        className={`h-3 w-3 ${
                          tenant.is_active
                            ? 'text-emerald-500'
                            : 'text-gray-400'
                        }`}
                      />
                      <span className="text-xs text-muted-foreground">
                        {tenant.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function StatsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[...Array(4)].map((_, i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            <div className="h-8 w-8 animate-pulse rounded-lg bg-muted" />
          </CardHeader>
          <CardContent>
            <div className="h-8 w-14 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-3 w-28 animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function TenantsSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <div className="h-6 w-40 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-56 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-9 w-20 animate-pulse rounded bg-muted" />
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="h-9 w-9 animate-pulse rounded-lg bg-muted" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-28 animate-pulse rounded bg-muted" />
                <div className="h-3 w-16 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default function SuperAdminDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Platform overview and management</p>
      </div>

      <Suspense fallback={<StatsSkeleton />}>
        <DashboardStats />
      </Suspense>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Suspense fallback={<TenantsSkeleton />}>
            <RecentTenants />
          </Suspense>
        </div>
        <div className="space-y-6">
          <BulkDeployButton />
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Link href="/superadmin/tenants/new">
                <Button variant="outline" className="w-full justify-start" size="sm">
                  <Store className="mr-2 h-4 w-4" />
                  Add New Restaurant
                </Button>
              </Link>
              <Link href="/superadmin/analytics">
                <Button variant="outline" className="w-full justify-start" size="sm">
                  <ShoppingBag className="mr-2 h-4 w-4" />
                  View Analytics
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
