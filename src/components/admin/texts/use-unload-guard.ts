'use client'

import { useEffect } from 'react'

/** While something is unsaved, closing or reloading the browser tab asks first. */
export function useUnloadGuard(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])
}
