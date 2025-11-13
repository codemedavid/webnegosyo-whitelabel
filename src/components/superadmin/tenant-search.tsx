'use client'

import { useState, useMemo, memo } from 'react'
import Link from 'next/link'
import { Edit, Eye, MoreVertical, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SearchBar } from '@/components/customer/search-bar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useDeleteTenant } from '@/lib/queries/tenants'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import type { Tenant } from '@/types/database'

interface TenantSearchProps {
  initialTenants: Tenant[]
}

interface TenantCardProps {
  tenant: Tenant
  onDelete: (tenant: Tenant) => void
}

// Memoized tenant card to prevent unnecessary re-renders
const TenantCard = memo(({ tenant, onDelete }: TenantCardProps) => (
  <Card>
    <CardContent className="p-6">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-semibold">{tenant.name}</h3>
          <p className="text-sm text-muted-foreground">/{tenant.slug}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={tenant.is_active ? 'default' : 'secondary'}>
            {tenant.is_active ? 'Active' : 'Inactive'}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <Link href={`/${tenant.slug}/menu`} target="_blank">
                <DropdownMenuItem>
                  <Eye className="mr-2 h-4 w-4" />
                  View Menu
                </DropdownMenuItem>
              </Link>
              <Link href={`/superadmin/tenants/${tenant.id}`}>
                <DropdownMenuItem>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Tenant
                </DropdownMenuItem>
              </Link>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(e) => {
                  e.preventDefault()
                  onDelete(tenant)
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Tenant
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [tenantToDelete, setTenantToDelete] = useState<Tenant | null>(null)
  const deleteMutation = useDeleteTenant()

  const filteredTenants = useMemo(
    () => initialTenants.filter((tenant) =>
      tenant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tenant.slug.toLowerCase().includes(searchQuery.toLowerCase())
    ),
    [initialTenants, searchQuery]
  )

  const handleDelete = () => {
    if (!tenantToDelete) return

    deleteMutation.mutate(tenantToDelete.id, {
      onSuccess: () => {
        toast.success(`${tenantToDelete.name} has been deleted`)
        setTenantToDelete(null)
        router.refresh()
      },
      onError: (error) => {
        const message = error instanceof Error ? error.message : 'Failed to delete tenant'
        toast.error(message)
      },
    })
  }

  return (
    <>
      <SearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search tenants..."
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredTenants.map((tenant) => (
          <TenantCard 
            key={tenant.id} 
            tenant={tenant} 
            onDelete={setTenantToDelete}
          />
        ))}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog 
        open={!!tenantToDelete} 
        onOpenChange={(open) => !open && setTenantToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tenant</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{tenantToDelete?.name}</strong>?
              <br />
              <br />
              This will permanently delete:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>All menu items and categories</li>
                <li>All orders and order history</li>
                <li>All admin users</li>
                <li>All payment methods and settings</li>
              </ul>
              <br />
              <strong className="text-destructive">This action cannot be undone.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete Tenant'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}