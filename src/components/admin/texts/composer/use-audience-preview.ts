'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTextsActions } from '../texts-actions'
import type { AudienceFilter, AudiencePreview } from '@/lib/texts/types'

const DEBOUNCE_MS = 500

export type PreviewState =
  | { status: 'loading'; preview: AudiencePreview | null }
  | { status: 'ready'; preview: AudiencePreview }
  | { status: 'error'; preview: AudiencePreview | null }

/**
 * Who would get this right now, re-counted 500 ms after the owner stops
 * changing WHO. Typing the message never re-counts (the segment meter is
 * client-side) — previews are rate-limited, so they are spent on audience
 * changes only. A refused or failed count keeps the last good one. A stale
 * answer never overwrites a newer one.
 */
export function useAudiencePreview(tenantId: string, audience: AudienceFilter, messageTemplate: string) {
  const [state, setState] = useState<PreviewState>({ status: 'loading', preview: null })
  /** The message the samples were rendered from: once it changes, they are stale. */
  const [sampledTemplate, setSampledTemplate] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const request = useRef(0)
  const actions = useTextsActions()
  const template = useRef(messageTemplate)
  useEffect(() => { template.current = messageTemplate }, [messageTemplate])
  const key = JSON.stringify(audience)

  useEffect(() => {
    const mine = ++request.current
    setState((prev) => ({ status: 'loading', preview: prev.preview }))
    const timer = setTimeout(() => {
      const filter = JSON.parse(key) as AudienceFilter
      const sent = template.current.trim()
      actions.previewCampaignAudienceAction(tenantId, { audience: filter, messageTemplate: sent })
        .then((result) => {
          if (mine !== request.current) return
          if (result.ok) setSampledTemplate(sent)
          setState((prev) => (result.ok ? { status: 'ready', preview: result.value } : { status: 'error', preview: prev.preview }))
        })
        .catch(() => {
          if (mine === request.current) setState((prev) => ({ status: 'error', preview: prev.preview }))
        })
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [actions, tenantId, key, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { state, retry, sampledTemplate }
}
