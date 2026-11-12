import { useEffect, useState } from 'react'

/**
 * `value` once its `key` has stayed the same for `delayMs`. `isSettled` is
 * false while a newer value is still waiting, so callers can say "checking…".
 */
export function useDebouncedValue<T>(value: T, key: string | null, delayMs: number): { value: T; key: string | null; isSettled: boolean } {
  const [settled, setSettled] = useState<{ value: T; key: string | null }>({ value, key })
  useEffect(() => {
    if (key === settled.key) return undefined
    const timer = setTimeout(() => setSettled({ value, key }), delayMs)
    return () => clearTimeout(timer)
    // `value` follows `key`: a new key is what starts the wait.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, delayMs, settled.key])
  return { ...settled, isSettled: settled.key === key }
}
