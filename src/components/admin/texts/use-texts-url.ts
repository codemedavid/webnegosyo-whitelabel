'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { opensSheet, parseTextsParams, patchTextsParams, serializeTextsParams, type TextsUrlState } from '@/lib/texts/view/url'

function readLocation(): string {
  return typeof window === 'undefined' ? '' : window.location.search.replace(/^\?/, '')
}

/**
 * Tabs, filters and sheets live in the URL so every state is a link.
 * Opening a sheet pushes a history entry (Back closes it, never the page);
 * tabs, filters and closing replace. Changes go through the history API, so
 * the server page does not re-run for every sheet; Back/Forward are read
 * from `popstate`.
 */
export function useTextsUrl() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [query, setQuery] = useState(() => params.toString())
  const state = useMemo(() => parseTextsParams(new URLSearchParams(query)), [query])
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])

  // A Next navigation (a link, router.refresh) moves the params: follow them.
  useEffect(() => setQuery(params.toString()), [params])

  useEffect(() => {
    const onPop = () => setQuery(readLocation())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const setUrl = useCallback(
    (patch: Partial<TextsUrlState>) => {
      const prev = stateRef.current
      const next = patchTextsParams(prev, patch)
      const qs = serializeTextsParams(next)
      const href = qs ? `${pathname}?${qs}` : pathname
      if (opensSheet(prev, next)) window.history.pushState(null, '', href)
      else window.history.replaceState(null, '', href)
      stateRef.current = next
      setQuery(qs)
    },
    [pathname]
  )

  /** An attention or Owl link: "?…" changes only what it names; anything else navigates. */
  const go = useCallback(
    (href: string) => {
      if (!href.startsWith('?')) return router.push(href)
      const linked = new URLSearchParams(href.slice(1))
      const parsed = parseTextsParams(linked)
      const keyOf: Record<string, keyof TextsUrlState> = { view: 'isReport' }
      const patch = Object.fromEntries(
        [...linked.keys()].map((key) => keyOf[key] ?? key).filter((key) => key in parsed).map((key) => [key, parsed[key as keyof TextsUrlState]])
      ) as Partial<TextsUrlState>
      setUrl(parsed.automatic ? { ...patch, tab: 'automatic' } : patch)
    },
    [router, setUrl]
  )

  return { url: state, setUrl, go }
}
