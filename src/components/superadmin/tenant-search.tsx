'use client'

import { useState, useMemo, memo } from 'react'
import Link from 'next/link'
import { Edit, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SearchBar } from '@/components/customer/search-bar'
import type { Tenant } from '@/types/database'

interface TenantSearchProps {
  initialTenants: Tenant[]
}

// Memoized tenant card to prevent unnecessary re-renders
const TenantCard = memo(({ tenant }: { tenant: Tenant }) => (
  <Card>
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
          prefetch={true}
        >
          <Button variant="default" size="sm" className="w-full">
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
        </Link>
      </div>
    </CardContent>
  </Card>
))

TenantCard.displayName = 'TenantCard'

export function TenantSearch({ initialTenants }: TenantSearchProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredTenants = useMemo(
    () => initialTenants.filter((tenant) =>
      tenant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tenant.slug.toLowerCase().includes(searchQuery.toLowerCase())
    ),
    [initialTenants, searchQuery]
  )

  return (
    <>
      <SearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search tenants..."
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredTenants.map((tenant) => (
          <TenantCard key={tenant.id} tenant={tenant} />
        ))}
      </div>
    </>
  )
}