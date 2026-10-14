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
import { cn } from '@/lib/utils'

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
      <AlertDialogContent className="rounded-2xl border-wn-line bg-white p-6 sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg tracking-tight">{request?.title}</AlertDialogTitle>
          <AlertDialogDescription className="text-[15px] leading-relaxed text-wn-stone">{request?.body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isBusy} className="min-h-11 rounded-full sm:min-h-9">{request?.cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={isBusy}
            onClick={(event) => {
              event.preventDefault()
              onConfirm()
            }}
            className={cn(request?.isDestructive && buttonVariants({ variant: 'destructive' }), 'min-h-11 rounded-full px-5 sm:min-h-9')}
          >
            {isBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {request?.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
