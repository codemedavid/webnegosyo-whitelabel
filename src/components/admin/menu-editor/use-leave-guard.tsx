'use client'

/**
 * Keeps an owner from losing edits by leaving the dish editor.
 *
 * Two exits are covered: closing or reloading the tab (`beforeunload`, which
 * the browser answers with its own prompt) and following any in-app link —
 * the back arrow, the sidebar, a breadcrumb. Links are caught in the capture
 * phase on the document, before Next's <Link> handler navigates, so one guard
 * covers links this component does not render.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/** The in-app destination a click would navigate to, or null to let it through. */
function guardedHref(event: MouseEvent): string | null {
  if (event.defaultPrevented || event.button !== 0) return null
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null
  const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
  if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return null
  const href = anchor.getAttribute('href')
  if (!href || href.startsWith('#')) return null
  const url = new URL(anchor.href, window.location.href)
  if (url.origin !== window.location.origin) return null
  return `${url.pathname}${url.search}${url.hash}`
}

export function useLeaveGuard(isDirty: boolean) {
  const router = useRouter()
  const [pendingHref, setPendingHref] = useState<string | null>(null)

  useEffect(() => {
    if (!isDirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const onClick = (event: MouseEvent) => {
      const href = guardedHref(event)
      if (!href) return
      event.preventDefault()
      event.stopPropagation()
      setPendingHref(href)
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('click', onClick, true)
    }
  }, [isDirty])

  return {
    /** Ask before going somewhere the editor itself sends the owner (Cancel). */
    requestLeave: (href: string) => (isDirty ? setPendingHref(href) : router.push(href)),
    dialog: (
      <Dialog open={pendingHref !== null} onOpenChange={(open) => !open && setPendingHref(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Leave without saving?</DialogTitle>
            <DialogDescription>Your changes to this dish will be lost.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" className="max-sm:h-11" onClick={() => setPendingHref(null)}>
              Keep editing
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="max-sm:h-11"
              onClick={() => {
                const href = pendingHref
                setPendingHref(null)
                if (href) router.push(href)
              }}
            >
              Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    ),
  }
}
