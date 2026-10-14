'use client'

import { Loader2 } from 'lucide-react'
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
import { buttonVariants } from '@/components/ui/button'

export interface ConfirmRequest {
  title: string
  body: string
  cancelLabel: string
  confirmLabel: string
  isDestructive?: boolean
  onConfirm: () => Promise<void> | void
}

interface ConfirmDialogProps {
  request: ConfirmRequest | null
  isBusy: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** One confirm for every risky tap; Cancel holds focus by default. */
export function ConfirmDialog({ request, isBusy, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <AlertDialog open={request !== null} onOpenChange={(open) => !open && !isBusy && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{request?.title}</AlertDialogTitle>
          <AlertDialogDescription>{request?.body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isBusy}>{request?.cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={isBusy}
            onClick={(event) => {
              event.preventDefault()
              onConfirm()
            }}
            className={request?.isDestructive ? buttonVariants({ variant: 'destructive' }) : undefined}
          >
            {isBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {request?.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
