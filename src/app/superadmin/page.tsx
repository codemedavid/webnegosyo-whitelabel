import { Suspense } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Store, Users, Activity, TrendingUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { getTenants } from '@/lib/queries/tenants-server'

// Cache the dashboard for 60s to avoid repeated DB hits on navigation
export const revalidate = 60

// Server Component - renders on server, NO client bundle
async function DashboardStats() {
  const tenants = await getTenants()
  const totalTenants = tenants.length
  const activeTenants = tenants.filter((t) => t.is_active).length

  const stats = [
    {
      title: 'Total Restaurants',
      value: totalTenants,
      description: `${activeTenants} active`,
      icon: Store,
      color: 'text-blue-600',
    },
    {
      title: 'Active Users',
      value: 12,
      description: 'Across all tenants',
      icon: Users,
      color: 'text-green-600',
    },
    {
      title: 'System Status',
      value: 'Healthy',
      description: 'All systems operational',
      icon: Activity,
      color: 'text-emerald-600',
    },
    {
      title: 'Growth',
      value: '+23%',
      description: 'This month',
      icon: TrendingUp,
      color: 'text-orange-600',
    },
  ]

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => {
        const Icon = stat.icon
        return (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <Icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

async function RecentTenants() {
  const tenants = await getTenants()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Tenants</CardTitle>
      </CardHeader>
      <CardContent>
        {tenants.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground">No tenants yet</div>
        ) : (
          <div className="space-y-3">
            {tenants.map((tenant) => (
              <Link key={tenant.id} href={`/superadmin/tenants/${tenant.id}`}>
                <div className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted">
                  <div>
                    <h3 className="font-semibold">{tenant.name}</h3>
                    <p className="text-sm text-muted-foreground">{tenant.slug}</p>
                  </div>
                  <Badge variant={tenant.is_active ? 'default' : 'secondary'}>
                    {tenant.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Main page - Server Component with Suspense streaming
export default function SuperAdminDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Super Admin Dashboard</h1>
        <p className="text-muted-foreground">Manage all restaurants and tenants</p>
      </div>

      <Suspense 
        fallback={
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <div className="h-4 w-24 animate-pulse bg-muted rounded" />
                </CardHeader>
                <CardContent>
                  <div className="h-8 w-16 animate-pulse bg-muted rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        }
      >
        <DashboardStats />
      </Suspense>

      <Suspense 
        fallback={
          <Card>
            <CardHeader>
              <div className="h-6 w-32 animate-pulse bg-muted rounded" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-20 w-full animate-pulse bg-muted rounded" />
                ))}
              </div>
            </CardContent>
          </Card>
        }
      >
        <RecentTenants />
      </Suspense>
    </div>
  )
}

