'use client'
import Link from 'next/link'
import { Plus, Edit, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SearchBar } from '@/components/customer/search-bar'
import { EmptyState } from '@/components/shared/empty-state'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { useState, useMemo } from 'react'
import { useTenants, usePrefetchTenant } from '@/lib/queries/tenants'

export default function TenantsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const { data: tenants = [], isLoading } = useTenants()
  const prefetchTenant = usePrefetchTenant()

  const filteredTenants = useMemo(
    () => tenants.filter((tenant) =>
      tenant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tenant.slug.toLowerCase().includes(searchQuery.toLowerCase())
    ),
    [tenants, searchQuery]
  )

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

      <SearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search tenants..."
      />

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading tenants...</p>
        </div>
      ) : filteredTenants.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="No tenants found"
          description="Get started by adding your first restaurant tenant"
          actionLabel="Add Tenant"
          onAction={() => {}}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTenants.map((tenant) => (
            <Card key={tenant.id}>
              <CardContent className="p-6">
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold">{tenant.name}</h3>
                    <p className="text-sm text-muted-foreground">/{tenant.slug}</p>
                  </div>
                  <Badge variant={tenant.is_active ? 'default' : 'secondary'}>
                    {tenant.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>

                <div className="mb-4 flex items-center gap-2">
                  <div
                    className="h-4 w-4 rounded-full"
                    style={{ backgroundColor: tenant.primary_color }}
                  />
                  <span className="text-sm text-muted-foreground">
                    {tenant.primary_color}
                  </span>
                </div>

                {tenant.domain && (
                  <p className="mb-4 text-sm text-muted-foreground">
                    🌐 {tenant.domain}
                  </p>
                )}

                <div className="flex gap-2">
                  <Link href={`/${tenant.slug}/menu`} target="_blank" className="flex-1">
                    <Button variant="outline" size="sm" className="w-full">
                      <Eye className="mr-2 h-4 w-4" />
                      View
                    </Button>
                  </Link>
                  <Link 
                    href={`/superadmin/tenants/${tenant.id}`} 
                    className="flex-1"
                    onMouseEnter={() => prefetchTenant(tenant.id)}
                  >
                    <Button variant="default" size="sm" className="w-full">
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

