'use client'

import { useState } from 'react'
import { Camera, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface IdPhotoViewerProps {
  tenantId: string
  photoId: string
  claimantName: string
}

type ViewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'shown'; url: string }
  | { status: 'error'; message: string }

/**
 * "View ID photo" for a reviewer. The link is asked for only on a tap and
 * lasts 60 seconds (the route checks the reviewer's access first), so an
 * ID never sits in the page's HTML or in a shareable URL.
 */
export function IdPhotoViewer({ tenantId, photoId, claimantName }: IdPhotoViewerProps) {
  const [state, setState] = useState<ViewState>({ status: 'idle' })

  async function open() {
    setState({ status: 'loading' })
    try {
      const response = await fetch('/api/gov-discounts/id-photos/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, photoId }),
      })
      const json = (await response.json().catch(() => ({}))) as { url?: string; error?: string }
      if (!response.ok || typeof json.url !== 'string') {
        setState({ status: 'error', message: json.error ?? 'Could not open the photo. Try again.' })
        return
      }
      setState({ status: 'shown', url: json.url })
    } catch {
      setState({ status: 'error', message: 'Could not open the photo. Check your connection and try again.' })
    }
  }

  if (state.status === 'shown') {
    return (
      <figure className="space-y-2">
        {/* A 60-second signed link to a private object — not something next/image should cache. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={state.url}
          alt={`ID photo for ${claimantName}`}
          className="max-h-80 w-full rounded-md border object-contain"
          referrerPolicy="no-referrer"
        />
        <figcaption className="text-xs text-muted-foreground">
          Private. Deleted automatically 90 days after it was taken.
        </figcaption>
      </figure>
    )
  }

  return (
    <div className="space-y-1">
      <Button type="button" variant="outline" size="sm" onClick={open} disabled={state.status === 'loading'}>
        {state.status === 'loading' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
        View ID photo
      </Button>
      {state.status === 'error' && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
    </div>
  )
}
