'use client'

/**
 * The editor's contextual save bar, pinned to the bottom of the screen.
 *
 * Editing a dish: the bar appears only once something changed — dark, saying
 * "Unsaved changes", with Discard and Save — so an owner always knows whether
 * what is on screen is what customers see. A new dish always shows it, with
 * "Save & add another" for owners entering a whole menu.
 *
 * Buttons submit the form by id, so panels that save on their own (branches)
 * can sit outside the <form> without their Enter key submitting the dish.
 */

import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type SaveIntent = 'default' | 'add-another'

interface SaveBarProps {
  formId: string
  isSaving: boolean
  isNew: boolean
  isDirty: boolean
  onDiscard: () => void
  /** Called before the form submits, so the editor knows which button was used. */
  onIntent: (intent: SaveIntent) => void
}

export function SaveBar({ formId, isSaving, isNew, isDirty, onDiscard, onIntent }: SaveBarProps) {
  const isShown = isNew || isDirty || isSaving

  return (
    <div
      inert={!isShown}
      className={cn(
        'sticky bottom-0 z-20 -mx-4 mt-6 transition-[transform,opacity] duration-200 ease-out md:-mx-6',
        isShown ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0',
      )}
    >
      <div
        className={cn(
          'border-t px-4 py-3 md:px-6',
          isDirty ? 'border-foreground bg-foreground text-background' : 'bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85',
        )}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-2">
          <p className="mr-auto min-w-0 truncate text-sm font-medium" aria-live="polite">
            {isDirty ? 'Unsaved changes' : ''}
          </p>

          {isDirty && !isNew && (
            <Button
              type="button"
              variant="ghost"
              onClick={onDiscard}
              disabled={isSaving}
              className="h-11 text-background hover:bg-background/15 hover:text-background"
            >
              Discard
            </Button>
          )}

          {isNew && (
            <Button
              type="submit"
              form={formId}
              variant="outline"
              disabled={isSaving}
              onClick={() => onIntent('add-another')}
              className={cn('h-11 max-sm:px-3', isDirty && 'border-background/30 bg-transparent text-background hover:bg-background/15 hover:text-background')}
            >
              Save &amp; add another
            </Button>
          )}

          <Button
            type="submit"
            form={formId}
            disabled={isSaving}
            onClick={() => onIntent('default')}
            className={cn('h-11 px-6 text-base', isDirty && 'bg-background text-foreground hover:bg-background/90')}
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            {isSaving ? 'Saving…' : isNew ? 'Add dish' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}
