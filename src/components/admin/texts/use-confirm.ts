'use client'

import { useCallback, useState } from 'react'
import type { ConfirmRequest } from './confirm-dialog'

/** Holds the one open confirm and runs its action; the dialog closes when it settles. */
export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)
  const [isBusy, setBusy] = useState(false)

  const ask = useCallback((next: ConfirmRequest) => setRequest(next), [])
  const cancel = useCallback(() => setRequest(null), [])
  const confirm = useCallback(async () => {
    if (!request) return
    setBusy(true)
    try {
      await request.onConfirm()
    } finally {
      setBusy(false)
      setRequest(null)
    }
  }, [request])

  return { ask, dialogProps: { request, isBusy, onConfirm: () => void confirm(), onCancel: cancel } }
}
