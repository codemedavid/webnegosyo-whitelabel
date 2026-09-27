'use client'

/**
 * The editor's one primary action, pinned to the bottom of the screen so an
 * owner halfway down a long dish never has to scroll to find Save. It submits
 * the form by id, which lets panels that save on their own (branches) sit
 * outside the <form> without their Enter key submitting the dish.
 */

import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SaveBarProps {
  formId: string
  isSaving: boolean
  isNew: boolean
  onCancel: () => void
}

export function SaveBar({ formId, isSaving, isNew, onCancel }: SaveBarProps) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 border-t bg-background px-4 py-3 md:-mx-6 md:px-6">
      <div className="mx-auto flex max-w-3xl items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isSaving} className="h-11">
          Cancel
        </Button>
        <Button type="submit" form={formId} disabled={isSaving} className="h-11 flex-1 text-base sm:flex-none sm:px-8">
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
          {isSaving ? 'Saving…' : isNew ? 'Add dish' : 'Save changes'}
        </Button>
      </div>
    </div>
  )
}
