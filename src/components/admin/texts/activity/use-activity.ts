'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { activityRequest, type ActivityItem, type ActivityPage } from '@/lib/texts/view/activity'
import type { ActivityShow } from '@/lib/texts/view/url'
import { callAutomations } from '../automatic/call-automations'
import { useTextsActions } from '../texts-actions'

type State = { status: 'loading' | 'ready' | 'error'; items: ActivityItem[]; nextCursor: string | null; isLoadingMore: boolean }

/** Cursor pages from the `activity` action (campaign rows included on the web). */
export function useActivity(tenantId: string, show: ActivityShow, from: string | null, automationIdFor: (recipe: string) => string | null) {
  const [state, setState] = useState<State>({ status: 'loading', items: [], nextCursor: null, isLoadingMore: false })
  const [attempt, setAttempt] = useState(0)
  const request = useRef(0)
  const actions = useTextsActions()

  const fetchPage = useCallback(
    (cursor: string | null) => callAutomations<ActivityPage>(actions, tenantId, activityRequest({ show, from, cursor, automationIdFor })),
    [actions, tenantId, show, from, automationIdFor]
  )

  useEffect(() => {
    const mine = ++request.current
    setState({ status: 'loading', items: [], nextCursor: null, isLoadingMore: false })
    void fetchPage(null).then((result) => {
      if (mine !== request.current) return
      setState(result.ok
        ? { status: 'ready', items: result.value.items, nextCursor: result.value.nextCursor, isLoadingMore: false }
        : { status: 'error', items: [], nextCursor: null, isLoadingMore: false })
    })
  }, [fetchPage, attempt])

  const loadMore = useCallback(async () => {
    if (!state.nextCursor || state.isLoadingMore) return
    const mine = request.current
    setState((prev) => ({ ...prev, isLoadingMore: true }))
    const result = await fetchPage(state.nextCursor)
    if (mine !== request.current) return
    setState((prev) => (result.ok
      ? { ...prev, items: [...prev.items, ...result.value.items], nextCursor: result.value.nextCursor, isLoadingMore: false }
      : { ...prev, isLoadingMore: false }))
  }, [fetchPage, state.nextCursor, state.isLoadingMore])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  return { state, loadMore, reload }
}
