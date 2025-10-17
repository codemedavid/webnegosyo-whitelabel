'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Plus, Edit, Trash2, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SearchBar } from '@/components/customer/search-bar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { formatPrice } from '@/lib/cart-utils'
import { deleteMenuItemAction, toggleAvailabilityAction } from '@/app/actions/menu-items'
import { toast } from 'sonner'
import type { MenuItem, Category } from '@/types/database'

interface MenuItemsListProps {
  items: MenuItem[]
  categories: Category[]
  tenantSlug: string
  tenantId: string
}

export function MenuItemsList({ items, categories, tenantSlug, tenantId }: MenuItemsListProps) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = categoryFilter === 'all' || item.category_id === categoryFilter
    return matchesSearch && matchesCategory
  })

  const handleDelete = async () => {
    if (!itemToDelete) return

    setIsDeleting(true)
    const result = await deleteMenuItemAction(itemToDelete, tenantId, tenantSlug)

    if (result.success) {
      toast.success('Menu item deleted successfully')
      setDeleteDialogOpen(false)
      setItemToDelete(null)
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to delete menu item')
    }
    setIsDeleting(false)
  }

  const handleToggleAvailability = async (itemId: string, currentAvailability: boolean) => {
    const result = await toggleAvailabilityAction(itemId, tenantId, tenantSlug, !currentAvailability)

    if (result.success) {
      toast.success(`Menu item ${!currentAvailability ? 'enabled' : 'disabled'}`)
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to update availability')
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex-1">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search menu items..."
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.icon} {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filteredItems.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Plus className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No menu items found</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery || categoryFilter !== 'all' 
                ? 'Try adjusting your filters'
                : 'Get started by adding your first menu item'}
            </p>
            <Link href={`/${tenantSlug}/admin/menu/new`}>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Item
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map((item) => (
            <Card key={item.id} className="overflow-hidden">
              <div className="relative aspect-video">
                <Image
                  src={item.image_url}
                  alt={item.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
                <div className="absolute right-2 top-2 flex gap-1">
                  {item.is_featured && <Badge variant="secondary">Featured</Badge>}
                  {item.discounted_price && <Badge variant="destructive">Sale</Badge>}
                </div>
              </div>
              <CardContent className="p-4">
                <div className="mb-2 flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold line-clamp-1">{item.name}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {item.description}
                    </p>
                  </div>
                </div>

                <div className="mb-3 flex items-center gap-2">
                  {item.discounted_price && (
                    <span className="text-sm text-muted-foreground line-through">
                      {formatPrice(item.price)}
                    </span>
                  )}
                  <span className="font-bold">
                    {formatPrice(item.discounted_price || item.price)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <Button
                    variant={item.is_available ? 'default' : 'secondary'}
                    size="sm"
                    onClick={() => handleToggleAvailability(item.id, item.is_available)}
                  >
                    {item.is_available ? (
                      <>
                        <Eye className="mr-1 h-3 w-3" />
                        Available
                      </>
                    ) : (
                      <>
                        <EyeOff className="mr-1 h-3 w-3" />
                        Hidden
                      </>
                    )}
                  </Button>
                  <div className="flex gap-1">
                    <Link href={`/${tenantSlug}/admin/menu/${item.id}`}>
                      <Button variant="ghost" size="icon">
                        <Edit className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => {
                        setItemToDelete(item.id)
                        setDeleteDialogOpen(true)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the menu item.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

