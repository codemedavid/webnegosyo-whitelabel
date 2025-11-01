'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Trash2, Eye, EyeOff, Settings, Users, ChevronUp, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import { toggleOrderTypeEnabledAction, deleteOrderTypeAction, reorderOrderTypesAction } from '@/app/actions/order-types'
import { toast } from 'sonner'
import { useEffect } from 'react'
import type { OrderType, CustomerFormField } from '@/types/database'

interface OrderTypesListProps {
  orderTypes: (OrderType & { customer_form_fields: CustomerFormField[] })[]
  tenantSlug: string
  tenantId: string
}

const orderTypeIcons = {
  dine_in: '🍽️',
  pickup: '📦',
  delivery: '🚚',
}

const orderTypeColors = {
  dine_in: 'bg-green-100 text-green-800 border-green-300',
  pickup: 'bg-blue-100 text-blue-800 border-blue-300',
  delivery: 'bg-orange-100 text-orange-800 border-orange-300',
}

export function OrderTypesList({ orderTypes, tenantSlug, tenantId }: OrderTypesListProps) {
  const router = useRouter()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [orderTypeToDelete, setOrderTypeToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [sortedOrderTypes, setSortedOrderTypes] = useState(
    [...orderTypes].sort((a, b) => a.order_index - b.order_index)
  )

  // Update sorted order when orderTypes prop changes
  useEffect(() => {
    setSortedOrderTypes([...orderTypes].sort((a, b) => a.order_index - b.order_index))
  }, [orderTypes])

  const handleToggleEnabled = async (orderTypeId: string, currentEnabled: boolean) => {
    const result = await toggleOrderTypeEnabledAction(orderTypeId, tenantId, tenantSlug, !currentEnabled)

    if (result.success) {
      toast.success(`Order type ${!currentEnabled ? 'enabled' : 'disabled'}`)
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to update order type')
    }
  }

  const handleDelete = async () => {
    if (!orderTypeToDelete) return

    setIsDeleting(true)
    const result = await deleteOrderTypeAction(orderTypeToDelete, tenantId, tenantSlug)

    if (result.success) {
      toast.success('Order type deleted successfully')
      setDeleteDialogOpen(false)
      setOrderTypeToDelete(null)
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to delete order type')
    }
    setIsDeleting(false)
  }

  const handleMove = async (orderTypeId: string, direction: 'up' | 'down') => {
    const currentIndex = sortedOrderTypes.findIndex(ot => ot.id === orderTypeId)
    if (currentIndex === -1) return

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (newIndex < 0 || newIndex >= sortedOrderTypes.length) return

    const newOrder = [...sortedOrderTypes]
    const [moved] = newOrder.splice(currentIndex, 1)
    newOrder.splice(newIndex, 0, moved)

    // Update order_index for all order types
    const orderTypeIds = newOrder.map(ot => ot.id)

    const result = await reorderOrderTypesAction(orderTypeIds, tenantId, tenantSlug)

    if (result.success) {
      setSortedOrderTypes(newOrder)
      toast.success('Order type order updated')
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to reorder order types')
    }
  }

  if (orderTypes.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Plus className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No order types configured</h3>
          <p className="text-muted-foreground mb-4">
            Configure your order types to allow customers to choose how they want to receive their orders
          </p>
          <Button onClick={() => router.push(`/${tenantSlug}/admin/order-types/new`)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Order Type
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="flex items-center justify-end mb-4">
        <Button onClick={() => router.push(`/${tenantSlug}/admin/order-types/new`)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Order Type
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {sortedOrderTypes.map((orderType, index) => (
          <Card key={orderType.id} className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-2xl">{orderTypeIcons[orderType.type]}</div>
                  <div>
                    <CardTitle className="text-lg">{orderType.name}</CardTitle>
                    {orderType.description && (
                      <p className="text-sm text-muted-foreground">{orderType.description}</p>
                    )}
                  </div>
                </div>
                <Badge className={orderTypeColors[orderType.type]} variant="outline">
                  {orderType.type.replace('_', ' ')}
                </Badge>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {orderType.customer_form_fields.length} form field{orderType.customer_form_fields.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleMove(orderType.id, 'up')}
                    disabled={index === 0}
                    title="Move up"
                    className="h-7 w-7"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleMove(orderType.id, 'down')}
                    disabled={index === sortedOrderTypes.length - 1}
                    title="Move down"
                    className="h-7 w-7"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                  <Button
                    variant={orderType.is_enabled ? 'default' : 'secondary'}
                    size="sm"
                    onClick={() => handleToggleEnabled(orderType.id, orderType.is_enabled)}
                  >
                    {orderType.is_enabled ? (
                      <>
                        <Eye className="mr-1 h-3 w-3" />
                        Enabled
                      </>
                    ) : (
                      <>
                        <EyeOff className="mr-1 h-3 w-3" />
                        Disabled
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {orderType.customer_form_fields.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Form Fields:</h4>
                  <div className="space-y-1">
                    {orderType.customer_form_fields.slice(0, 3).map((field) => (
                      <div key={field.id} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{field.field_label}</span>
                        {field.is_required && (
                          <Badge variant="outline" className="text-xs">Required</Badge>
                        )}
                      </div>
                    ))}
                    {orderType.customer_form_fields.length > 3 && (
                      <p className="text-xs text-muted-foreground">
                        +{orderType.customer_form_fields.length - 3} more...
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Link href={`/${tenantSlug}/admin/order-types/${orderType.id}`} className="flex-1">
                  <Button variant="outline" className="w-full">
                    <Settings className="mr-2 h-4 w-4" />
                    Configure
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive"
                  onClick={() => {
                    setOrderTypeToDelete(orderType.id)
                    setDeleteDialogOpen(true)
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the order type and all its form fields.
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
