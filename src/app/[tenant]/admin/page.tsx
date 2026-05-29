import { Suspense } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { UtensilsCrossed, FolderTree, TrendingUp, DollarSign, ShoppingBag, Clock } from 'lucide-react'
import { getCachedTenantBySlug, getCachedCategoriesByTenant } from '@/lib/cache'
import { getMenuItemsByTenant } from '@/lib/admin-service'
import { getOrderStats } from '@/lib/orders-service'
import { Button } from '@/components/ui/button'
import { DashboardSkeleton } from '@/components/admin/dashboard-skeleton'
import { ConvexDashboardStats } from '@/components/admin/convex-dashboard-stats'
import type { Tenant } from '@/types/database'

async function DashboardContent({
  tenantSlug,
  tenantId,
  convexUrl,
}: {
  tenantSlug: string
  tenantId: string
  convexUrl: string | null
}) {
  const ordersHref = `/${tenantSlug}/admin/orders`

  // Fetch menu/category data in both paths; only fetch Supabase order stats when Convex is not configured.
  const [menuItems, categories] = await Promise.all([
    getMenuItemsByTenant(tenantId),
    getCachedCategoriesByTenant(tenantId),
  ])

  const availableItems = menuItems.filter((item) => item.is_available).length

  // If tenant uses Convex, render the live Convex-powered stats client component.
  if (convexUrl) {
    return (
      <ConvexDashboardStats
        convexUrl={convexUrl}
        tenantSlug={tenantSlug}
        menuItemsCount={menuItems.length}
        availableItemsCount={availableItems}
        categoriesCount={categories.length}
      />
    )
  }

  const orderStats = await getOrderStats(tenantId).catch(() => ({
    todayOrders: 0,
    todayRevenue: 0,
    pendingOrders: 0,
    confirmedOrders: 0,
    preparingOrders: 0,
    readyOrders: 0,
  }))

  const stats = [
    {
      title: 'Total Menu Items',
      value: menuItems.length,
      description: `${availableItems} available`,
      icon: UtensilsCrossed,
      color: 'text-blue-600',
      href: null as string | null,
    },
    {
      title: 'Categories',
      value: categories.length,
      description: 'Active categories',
      icon: FolderTree,
      color: 'text-green-600',
      href: null as string | null,
    },
    {
      title: "Today's Orders",
      value: orderStats.todayOrders,
      description: `${orderStats.pendingOrders} pending`,
      icon: ShoppingBag,
      color: 'text-purple-600',
      href: ordersHref,
    },
    {
      title: "Today's Revenue",
      value: `₱${orderStats.todayRevenue.toFixed(2)}`,
      description: 'Total sales today',
      icon: DollarSign,
      color: 'text-red-600',
      href: ordersHref,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          const card = (
            <Card className={stat.href ? 'transition-colors hover:bg-muted/40 cursor-pointer' : undefined}>
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
          return stat.href ? (
            <Link
              key={stat.title}
              href={stat.href}
              className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
            >
              {card}
            </Link>
          ) : (
            <div key={stat.title}>{card}</div>
          )
        })}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Get started with common tasks</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Link href={`/${tenantSlug}/admin/menu/new`}>
              <Button variant="outline" className="w-full justify-start">
                <UtensilsCrossed className="mr-2 h-4 w-4" />
                Add Menu Item
              </Button>
            </Link>
            <Link href={`/${tenantSlug}/admin/categories`}>
              <Button variant="outline" className="w-full justify-start">
                <FolderTree className="mr-2 h-4 w-4" />
                Manage Categories
              </Button>
            </Link>
            <Link href={ordersHref}>
              <Button variant="outline" className="w-full justify-start">
                <ShoppingBag className="mr-2 h-4 w-4" />
                View Orders
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Link
          href={ordersHref}
          className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
        >
          <Card className="transition-colors hover:bg-muted/40 cursor-pointer">
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Order status overview</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-yellow-600" />
                  <span className="text-sm">Pending</span>
                </div>
                <span className="font-semibold">{orderStats.pendingOrders}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-600" />
                  <span className="text-sm">Confirmed</span>
                </div>
                <span className="font-semibold">{orderStats.confirmedOrders}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UtensilsCrossed className="h-4 w-4 text-orange-600" />
                  <span className="text-sm">Preparing</span>
                </div>
                <span className="font-semibold">{orderStats.preparingOrders}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-green-600" />
                  <span className="text-sm">Ready</span>
                </div>
                <span className="font-semibold">{orderStats.readyOrders}</span>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  )
}

export default async function AdminDashboard({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params

  const tenantData = await getCachedTenantBySlug(tenantSlug)

  if (!tenantData) {
    return <div>Tenant not found</div>
  }

  const tenant: Tenant = tenantData

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome to {tenant.name} admin panel</p>
      </div>

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent
          tenantSlug={tenantSlug}
          tenantId={tenant.id}
          convexUrl={tenant.convex_deployment_url ?? null}
        />
      </Suspense>
    </div>
  )
}
