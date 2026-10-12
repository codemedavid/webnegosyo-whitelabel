'use client'

import { Check, Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface TaxSaveBarProps {
  formId: string
  isDirty: boolean
  isSaving: boolean
  /** No profile yet: saving is what sets the store up, changed or not. */
  isFirstSave: boolean
  onDiscard: () => void
}

/** Pinned to the bottom of the screen so "did that save?" never needs a scroll. */
export function TaxSaveBar({ formId, isDirty, isSaving, isFirstSave, onDiscard }: TaxSaveBarProps) {
  const needsSaving = isDirty || isFirstSave

  return (
    <div
      className={cn(
        'sticky bottom-0 z-20 -mx-4 border-t px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:shadow-lg',
        needsSaving ? 'bg-background/95 sm:border-primary/40' : 'bg-background/90'
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 text-sm" aria-live="polite">
          {needsSaving ? (
            <>
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
              <span className="font-medium">{isFirstSave ? 'Not saved yet' : 'Unsaved changes'}</span>
              <span className="hidden text-muted-foreground sm:inline">
                — your registers still use the old settings
              </span>
            </>
          ) : (
            <>
              <Check className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="text-muted-foreground">All changes saved</span>
            </>
          )}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {isDirty && (
            <Button type="button" variant="ghost" onClick={onDiscard} disabled={isSaving}>
              Discard
            </Button>
          )}
          <Button type="submit" form={formId} disabled={isSaving || !needsSaving}>
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Save className="mr-2 h-4 w-4" aria-hidden />
            )}
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}
