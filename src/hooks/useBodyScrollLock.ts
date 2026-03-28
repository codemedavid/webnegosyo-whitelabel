import { useEffect, useRef } from 'react'

export function useBodyScrollLock(active: boolean) {
  const originalOverflowRef = useRef('')

  useEffect(() => {
    if (!active) return

    originalOverflowRef.current = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = originalOverflowRef.current
    }
  }, [active])
}
