'use client'

/**
 * Deleting lives on the dish itself, at the bottom, behind a confirmation —
 * not as a trash icon on every row of the menu list, one mis-tap from a
 * bestseller disappearing mid-service.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
import { deleteMenuItemAction } from '@/app/actions/menu-items'
import { describeActionError } from '@/components/admin/server-action-safety'

interface DeleteDishSectionProps {
  itemId: string
  itemName: string
  tenantId: string
  tenantSlug: string
}

export function DeleteDishSection({ itemId, itemName, tenantId, tenantSlug }: DeleteDishSectionProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const result = await deleteMenuItemAction(itemId, tenantId, tenantSlug)
      if (!result.success) {
        toast.error(result.error || 'Could not delete the dish. Please try again.')
        return
      }
      toast.success(`${itemName} deleted`)
      setIsOpen(false)
      router.push(`/${tenantSlug}/admin/menu`)
      router.refresh()
    } catch (error) {
      toast.error(describeActionError(error))
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-destructive/30 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div>
        <p className="text-sm font-semibold">Delete this dish</p>
        <p className="text-sm text-muted-foreground">
          Removes it from your menu for good. To hide it for today, turn off “Available to order” instead.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={() => setIsOpen(true)}
        className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="mr-1.5 h-4 w-4" />
        Delete dish
      </Button>

      <AlertDialog open={isOpen} onOpenChange={(open) => { if (!isDeleting) setIsOpen(open) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {itemName}?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be removed from your menu and cannot be brought back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void handleDelete()
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
