'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SheetDescription, SheetTitle } from '@/components/ui/sheet'

const CONFIRM_WINDOW_MS = 3000

interface SheetFrameProps {
  title: ReactNode
  description?: ReactNode
  /** Extra controls left of the close button (e.g. Edit / Preview). */
  headerExtra?: ReactNode
  isDirty?: boolean
  /** Bumped by the sheet when Esc / an outside click was refused: arm "Discard changes?". */
  armRequest?: number
  onClose: () => void
  footer?: ReactNode
  children: ReactNode
}

/**
 * The chrome every Texts sheet shares (the Boost EditorShell pattern): a
 * header with the close button, a scrolling body, a sticky footer. Closing
 * with unsaved changes arms in place — "Discard changes?" — instead of
 * stacking a dialog.
 */
export function SheetFrame({ title, description, headerExtra, isDirty = false, armRequest = 0, onClose, footer, children }: SheetFrameProps) {
  const [isArmed, setArmed] = useState(false)

  useEffect(() => {
    if (armRequest > 0) setArmed(true)
  }, [armRequest])

  useEffect(() => {
    if (!isArmed) return
    const timer = setTimeout(() => setArmed(false), CONFIRM_WINDOW_MS)
    return () => clearTimeout(timer)
  }, [isArmed])

  const close = () => {
    if (isDirty && !isArmed) {
      setArmed(true)
      return
    }
    onClose()
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          <SheetTitle className="truncate text-lg font-semibold">{title}</SheetTitle>
          {description
            ? <SheetDescription className="truncate text-xs">{description}</SheetDescription>
            : <SheetDescription className="sr-only">{title}</SheetDescription>}
        </div>
        {headerExtra}
        <Button
          type="button"
          variant={isArmed ? 'secondary' : 'ghost'}
          size={isArmed ? 'sm' : 'icon'}
          onClick={close}
          aria-label={isArmed ? 'Discard changes and close' : 'Close'}
          className={isArmed ? 'min-h-11' : 'size-11 sm:size-9'}
        >
          {isArmed ? 'Discard changes?' : <X className="h-5 w-5" />}
        </Button>
      </header>
      <div className="relative min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer && <footer className="border-t bg-background px-4 py-3 sm:px-6">{footer}</footer>}
    </div>
  )
}

/**
 * For a sheet with an editor: Esc and outside clicks never throw edits away —
 * they arm the close button's "Discard changes?" instead.
 */
export function useDirtyCloseGuard() {
  const [isDirty, setDirty] = useState(false)
  const [armRequest, setArmRequest] = useState(0)
  const guard = (event: Event) => {
    if (!isDirty) return
    event.preventDefault()
    setArmRequest((n) => n + 1)
  }
  return { isDirty, setDirty, armRequest, guard }
}
