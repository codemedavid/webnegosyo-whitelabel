import { Suspense } from 'react'
import Link from 'next/link'
import { Plus, Edit, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getTenants } from '@/lib/queries/tenants-server'
import { TenantSearch } from '@/components/superadmin/tenant-search'

async function TenantList() {
  const tenants = await getTenants()

  if (tenants.length === 0) {
    return (
      <EmptyState
        icon={Plus}
        title="No tenants found"
        description="Get started by adding your first restaurant tenant"
        actionLabel="Add Tenant"
        onAction={() => {}}
      />
    )
  }

  return (
    <>
      <TenantSearch initialTenants={tenants} />
    </>
  )
}

export default function TenantsPage() {
  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: '/superadmin' },
          { label: 'Tenants' },
        ]}
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Tenants</h1>
          <p className="text-muted-foreground">Manage all restaurant tenants</p>
        </div>
        <Link href="/superadmin/tenants/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Tenant
          </Button>
        </Link>
      </div>

      <Suspense
        fallback={
          <div>
            <div className="mb-6 h-10 w-full max-w-md animate-pulse bg-muted rounded" />
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      <div className="h-5 w-32 animate-pulse bg-muted rounded" />
                      <div className="h-4 w-20 animate-pulse bg-muted rounded" />
                      <div className="flex gap-2">
                        <div className="h-8 flex-1 animate-pulse bg-muted rounded" />
                        <div className="h-8 flex-1 animate-pulse bg-muted rounded" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        }
      >
        <TenantList />
      </Suspense>
    </div>
  )
}

