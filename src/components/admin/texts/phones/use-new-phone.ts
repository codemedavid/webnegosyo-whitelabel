'use client'

import { useEffect, useRef, useState } from 'react'
import type { SendingPhone } from '@/lib/texts/types'

/** The name of a phone that appeared while the sheet was open, for the success line. */
export function useNewPhone(phones: SendingPhone[], isOpen: boolean): string | null {
  const known = useRef<Set<string> | null>(null)
  const [connected, setConnected] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) {
      known.current = null
      setConnected(null)
      return
    }
    if (known.current === null) {
      known.current = new Set(phones.map((p) => p.deviceId))
      return
    }
    const fresh = phones.find((p) => !known.current?.has(p.deviceId))
    if (!fresh) return
    known.current = new Set(phones.map((p) => p.deviceId))
    setConnected(fresh.name)
  }, [phones, isOpen])

  return connected
}
