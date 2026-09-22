'use client'

import { Check, Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface SaveBarProps {
  isDirty: boolean
  isSaving: boolean
  onSave: () => void
  onDiscard: () => void
}

/**
 * The save affordance for the whole screen.
 *
 * The old Save button sat halfway down the left card, below the scheduling
 * inputs and above three more cards of settings that it also saved — so a
 * merchant who changed the POS markup at the bottom of the page had to scroll
 * back up past unrelated settings to find it, with nothing on screen saying
 * anything was unsaved. This is pinned to the bottom of the viewport and always
 * present, so "where do I save" and "did that save" are both answered without
 * scrolling.
 */
export function SaveBar({ isDirty, isSaving, onSave, onDiscard }: SaveBarProps) {
  return (
    <div
      className={cn(
        'sticky bottom-0 z-20 -mx-4 border-t px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:shadow-lg',
        isDirty ? 'bg-background/95 sm:border-primary/40' : 'bg-background/90'
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 text-sm">
          {isDirty ? (
            <>
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <span className="font-medium">Unsaved changes</span>
              <span className="hidden text-muted-foreground sm:inline">
                — customers still see the old settings
              </span>
            </>
          ) : (
            <>
              <Check className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="text-muted-foreground">All changes saved</span>
            </>
          )}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {isDirty && (
            <Button variant="ghost" onClick={onDiscard} disabled={isSaving}>
              Discard
            </Button>
          )}
          <Button onClick={onSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {isSaving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </div>
  )
}
