'use client'

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { TextsLive } from '@/lib/texts/types'

const SLOW_MS = 30_000
const FAST_MS = 10_000

export const liveKey = (tenantId: string) => ['texts-live', tenantId] as const

function isLive(value: unknown): value is TextsLive {
  return typeof value === 'object' && value !== null && 'sender' in value && 'attention' in value
}

async function fetchLive(tenantId: string): Promise<TextsLive> {
  const response = await fetch(`/api/admin/texts/live?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
  if (!response.ok) throw new Error(`live ${response.status}`)
  const body: unknown = await response.json()
  if (isLive(body)) return body
  const value = (body as { value?: unknown } | null)?.value
  if (isLive(value)) return value
  throw new Error('live: unexpected shape')
}

function isSending(live: TextsLive | undefined): boolean {
  if (!live) return false
  return live.sender.sending !== null || Object.values(live.progress).some((run) => run.waiting > 0)
}

/**
 * The page's heartbeat: GET /api/admin/texts/live every 30 s, every 10 s while
 * something is sending (or a sheet asks for it), never while the tab is in
 * the background. Server data from a refresh replaces the cache.
 */
export function useTextsLive(tenantId: string, initial: TextsLive, isFast: boolean) {
  const queryClient = useQueryClient()

  useEffect(() => {
    queryClient.setQueryData(liveKey(tenantId), initial)
  }, [queryClient, tenantId, initial])

  return useQuery({
    queryKey: liveKey(tenantId),
    queryFn: () => fetchLive(tenantId),
    initialData: initial,
    staleTime: 5_000,
    refetchInterval: (query) => (isFast || isSending(query.state.data) ? FAST_MS : SLOW_MS),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  })
}
