'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Loader2, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

/** How long a "tap again to confirm" button stays armed. */
const CONFIRM_WINDOW_MS = 3000

function useArmed(): [boolean, () => void, () => void] {
  const [isArmed, setArmed] = useState(false)
  useEffect(() => {
    if (!isArmed) return
    const timer = setTimeout(() => setArmed(false), CONFIRM_WINDOW_MS)
    return () => clearTimeout(timer)
  }, [isArmed])
  return [isArmed, () => setArmed(true), () => setArmed(false)]
}

export interface EditorShellProps {
  title: string
  subtitle: string
  preview: ReactNode
  /** A panel (the item picker) pushed over the form. */
  overlay?: ReactNode
  isLive: boolean
  onLiveChange: (isLive: boolean) => void
  isDirty: boolean
  isSaving: boolean
  saveLabel: string
  onSave: () => void
  onDelete?: () => void
  isDeleting?: boolean
  onClose: () => void
  children: ReactNode
}

/**
 * One editor frame for every offer type: the form and the diner's view side
 * by side on a laptop, a Edit / Preview switch on a phone, and one save bar
 * that is always in the same place. Destructive and discarding taps confirm
 * in place (tap again) rather than stacking a dialog on the sheet.
 */
export function EditorShell({
  title,
  subtitle,
  preview,
  overlay,
  isLive,
  onLiveChange,
  isDirty,
  isSaving,
  saveLabel,
  onSave,
  onDelete,
  isDeleting = false,
  onClose,
  children,
}: EditorShellProps) {
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit')
  const [isDeleteArmed, armDelete, disarmDelete] = useArmed()
  const [isCloseArmed, armClose] = useArmed()
  const isBusy = isSaving || isDeleting

  const handleClose = () => {
    if (isDirty && !isCloseArmed) {
      armClose()
      return
    }
    onClose()
  }

  const handleDelete = () => {
    if (!onDelete) return
    if (!isDeleteArmed) {
      armDelete()
      return
    }
    disarmDelete()
    onDelete()
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          <SheetTitle className="truncate text-lg font-semibold">{title}</SheetTitle>
          <SheetDescription className="truncate text-xs">{subtitle}</SheetDescription>
        </div>
        <div className="flex rounded-full bg-muted p-0.5 lg:hidden" role="tablist" aria-label="Editor view">
          {(['edit', 'preview'] as const).map((view) => (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={mobileView === view}
              onClick={() => setMobileView(view)}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                mobileView === view ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
              )}
            >
              {view}
            </button>
          ))}
        </div>
        <Button
          type="button"
          variant={isCloseArmed ? 'secondary' : 'ghost'}
          size={isCloseArmed ? 'sm' : 'icon'}
          onClick={handleClose}
          aria-label="Close"
        >
          {isCloseArmed ? 'Discard changes?' : <X className="h-5 w-5" />}
        </Button>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <div
          className={cn(
            'relative min-h-0 flex-1 overflow-y-auto',
            mobileView === 'preview' && 'hidden lg:block'
          )}
        >
          <div className="mx-auto max-w-xl space-y-8 px-4 py-6 sm:px-6">{children}</div>
          {overlay && <div className="absolute inset-0 z-10 bg-background">{overlay}</div>}
        </div>
        <aside
          aria-label="Customer preview"
          className={cn(
            'min-h-0 overflow-y-auto border-l bg-muted/40 px-6 py-8 lg:block lg:w-[380px] lg:shrink-0',
            mobileView === 'preview' ? 'block flex-1 border-l-0' : 'hidden'
          )}
        >
          {preview}
        </aside>
      </div>

      <footer className="flex items-center gap-3 border-t bg-background px-4 py-3 sm:px-6">
        <label className="flex cursor-pointer items-center gap-2.5 text-sm">
          <Switch checked={isLive} onCheckedChange={onLiveChange} disabled={isBusy} aria-label="Live for customers" />
          <span className={cn('font-medium', isLive ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground')}>
            {isLive ? 'Live' : 'Paused'}
          </span>
        </label>
        <div className="flex-1" />
        {onDelete && (
          <Button
            type="button"
            variant={isDeleteArmed ? 'destructive' : 'ghost'}
            size={isDeleteArmed ? 'sm' : 'icon'}
            onClick={handleDelete}
            disabled={isBusy}
            aria-label="Delete"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isDeleteArmed ? (
              'Tap again to delete'
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        )}
        <Button type="button" onClick={onSave} disabled={isBusy} className="min-w-[120px]">
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSaving ? 'Saving…' : saveLabel}
        </Button>
      </footer>
    </div>
  )
}

interface FieldBlockProps {
  title: string
  hint?: string
  error?: string
  action?: ReactNode
  children: ReactNode
}

/** A titled group inside an editor. Errors sit under the title, in words. */
export function FieldBlock({ title, hint, error, action, children }: FieldBlockProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {action}
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {children}
    </section>
  )
}
