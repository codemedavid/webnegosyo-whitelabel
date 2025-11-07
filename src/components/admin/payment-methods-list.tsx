'use client'

import { useState } from 'react'
import { Edit, Trash2, GripVertical, Eye, EyeOff, QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { deletePaymentMethodAction, togglePaymentMethodStatusAction, reorderPaymentMethodsAction } from '@/app/actions/payment-methods'
import type { PaymentMethodWithOrderTypes } from '@/lib/payment-methods-service'
import type { OrderType } from '@/types/database'

interface PaymentMethodsListProps {
  paymentMethods: PaymentMethodWithOrderTypes[]
  orderTypes: OrderType[]
  tenantId: string
  tenantSlug: string
  onEdit: (paymentMethod: PaymentMethodWithOrderTypes) => void
  onRefresh: () => void
}

export function PaymentMethodsList({
  paymentMethods,
  orderTypes,
  tenantId,
  tenantSlug,
  onEdit,
  onRefresh,
}: PaymentMethodsListProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [qrDialogOpen, setQrDialogOpen] = useState(false)
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodWithOrderTypes | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [items, setItems] = useState(paymentMethods)

  // Update items when paymentMethods prop changes
  useState(() => {
    setItems(paymentMethods)
  })

  const handleDelete = async () => {
    if (!selectedMethod) return

    setIsDeleting(true)
    try {
      const result = await deletePaymentMethodAction(selectedMethod.id, tenantId, tenantSlug)
      
      if (result.success) {
        toast.success('Payment method deleted successfully')
        setDeleteDialogOpen(false)
        onRefresh()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete payment method')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleToggleStatus = async (paymentMethod: PaymentMethodWithOrderTypes) => {
    try {
      const result = await togglePaymentMethodStatusAction(
        paymentMethod.id,
        tenantId,
        tenantSlug,
        !paymentMethod.is_active
      )
      
      if (result.success) {
        toast.success(`Payment method ${!paymentMethod.is_active ? 'enabled' : 'disabled'}`)
        onRefresh()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update payment method')
    }
  }

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/html', index.toString())
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    const dragIndex = parseInt(e.dataTransfer.getData('text/html'))
    
    if (dragIndex === dropIndex) return

    const newItems = [...items]
    const [draggedItem] = newItems.splice(dragIndex, 1)
    newItems.splice(dropIndex, 0, draggedItem)
    
    setItems(newItems)

    // Update order in backend
    try {
      const result = await reorderPaymentMethodsAction(
        tenantId,
        tenantSlug,
        newItems.map(item => item.id)
      )
      
      if (result.success) {
        toast.success('Payment methods reordered')
        onRefresh()
      } else {
        throw new Error(result.error)
      }
    } catch {
      toast.error('Failed to reorder payment methods')
      setItems(paymentMethods) // Revert on error
    }
  }

  const getOrderTypeNames = (orderTypeIds: string[]) => {
    return orderTypeIds
      .map(id => orderTypes.find(ot => ot.id === id)?.name)
      .filter(Boolean)
      .join(', ')
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <p className="text-gray-500 mb-4">No payment methods yet</p>
          <p className="text-sm text-gray-400">Add a payment method to get started</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="space-y-3">
        {items.map((paymentMethod, index) => (
          <Card
            key={paymentMethod.id}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, index)}
            className={`transition-all hover:shadow-md cursor-move ${
              !paymentMethod.is_active ? 'opacity-60' : ''
            }`}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                {/* Drag Handle */}
                <div className="cursor-grab active:cursor-grabbing">
                  <GripVertical className="h-5 w-5 text-gray-400" />
                </div>

                {/* QR Code Thumbnail */}
                {paymentMethod.qr_code_url && (
                  <div className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={paymentMethod.qr_code_url}
                      alt="QR Code"
                      className="w-12 h-12 object-cover rounded border cursor-pointer hover:opacity-80"
                      onClick={() => {
                        setSelectedMethod(paymentMethod)
                        setQrDialogOpen(true)
                      }}
                    />
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900 truncate">
                      {paymentMethod.name}
                    </h3>
                    {!paymentMethod.is_active && (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </div>
                  
                  {paymentMethod.details && (
                    <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                      {paymentMethod.details}
                    </p>
                  )}
                  
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>Available for:</span>
                    <span className="font-medium">
                      {getOrderTypeNames(paymentMethod.order_types) || 'None'}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {paymentMethod.qr_code_url && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSelectedMethod(paymentMethod)
                        setQrDialogOpen(true)
                      }}
                      title="View QR Code"
                    >
                      <QrCode className="h-4 w-4" />
                    </Button>
                  )}
                  
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleToggleStatus(paymentMethod)}
                    title={paymentMethod.is_active ? 'Disable' : 'Enable'}
                  >
                    {paymentMethod.is_active ? (
                      <Eye className="h-4 w-4" />
                    ) : (
                      <EyeOff className="h-4 w-4" />
                    )}
                  </Button>
                  
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(paymentMethod)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setSelectedMethod(paymentMethod)
                      setDeleteDialogOpen(true)
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Payment Method</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{selectedMethod?.name}&quot;? This action cannot be undone.
              Existing orders with this payment method will retain their payment information.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-500 hover:bg-red-600"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* QR Code View Dialog */}
      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedMethod?.name} - QR Code</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {selectedMethod?.qr_code_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selectedMethod.qr_code_url}
                alt="QR Code"
                className="w-full max-w-sm h-auto object-contain border rounded-lg"
              />
            )}
            {selectedMethod?.details && (
              <div className="w-full">
                <p className="text-sm font-medium mb-1">Payment Details:</p>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">
                  {selectedMethod.details}
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

