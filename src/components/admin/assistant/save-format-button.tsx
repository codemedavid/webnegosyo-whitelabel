'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BookmarkPlus, Check } from 'lucide-react'
import type { FileCard } from '@/lib/assistant/types'

type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; message: string }

/**
 * "Save to My formats" on a custom report's card: the OWNER's tap keeps the
 * report's shape (never its figures) so it can be made again for any dates
 * from the Export page. The route checks the whole thing again.
 */
export function SaveFormatButton({ save }: { save: NonNullable<FileCard['save']> }) {
  const router = useRouter()
  const [state, setState] = useState<SaveState>({ kind: 'idle' })

  const keep = async () => {
    if (state.kind === 'saving' || state.kind === 'saved') return
    setState({ kind: 'saving' })
    try {
      const response = await fetch('/api/exports/formats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', tenantId: save.tenantId, name: save.name, spec: save.spec }),
      })
      const body = (await response.json().catch(() => null)) as { success?: boolean; error?: string } | null
      if (response.ok && body?.success) {
        setState({ kind: 'saved' })
        // The Export page may be the one open behind the chat: let its My formats list pick this up.
        router.refresh()
      } else setState({ kind: 'error', message: body?.error ?? 'That could not be saved. Try again in a moment.' })
    } catch {
      setState({ kind: 'error', message: 'That could not be saved. Check your connection and try again.' })
    }
  }

  if (state.kind === 'saved') {
    return (
      <p role="status" className="flex items-start gap-1.5 text-xs font-semibold leading-snug text-emerald-800">
        <Check className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
        Saved as “{save.name}”. Find it under My formats on the Export page.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => void keep()}
        disabled={state.kind === 'saving'}
        className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-full px-3 text-[13px] font-semibold text-foreground ring-1 ring-border outline-none transition-colors hover:ring-foreground focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-60"
      >
        <BookmarkPlus className="h-4 w-4" aria-hidden />
        {state.kind === 'saving' ? 'Saving…' : 'Save to My formats'}
      </button>
      {state.kind === 'error' && (
        <p role="alert" className="text-xs leading-snug text-red-700">
          {state.message}
        </p>
      )}
    </div>
  )
}
