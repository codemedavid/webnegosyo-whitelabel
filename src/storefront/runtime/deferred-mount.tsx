'use client'

import { useEffect, useState, type ReactNode } from 'react'

/** Load an overlay on first use, then retain its caches and exit animations. */
export function DeferredMount({ active, children }: { active: boolean; children: ReactNode }) {
  const [hasOpened, setHasOpened] = useState(active)
  useEffect(() => {
    if (active) setHasOpened(true)
  }, [active])
  return active || hasOpened ? children : null
}
