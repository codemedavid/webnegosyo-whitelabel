const CHUNK_RELOAD_KEY = 'webnegosyo:chunk-reload-at'
const CHUNK_RELOAD_COOLDOWN_MS = 60_000

export function isChunkLoadError(error: Error): boolean {
  return /Failed to load chunk\b|Loading (?:CSS )?chunk .+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i.test(error.message)
}

export function isResourceLoadError(error: Error): boolean {
  return isChunkLoadError(error) || error.message === 'Load failed'
}

interface RecoveryOptions {
  storage: Pick<Storage, 'getItem' | 'setItem'>
  reload: () => void
  online: boolean
  now: number
}

/** A failed module stays rejected in the runtime cache; reset() cannot refetch it. */
export function recoverChunkLoad(error: Error, options?: RecoveryOptions): boolean {
  if (!isChunkLoadError(error)) return false
  try {
    const { storage, reload, online, now } = options ?? {
      storage: window.sessionStorage,
      reload: () => window.location.reload(),
      online: navigator.onLine,
      now: Date.now(),
    }
    if (!online) return false
    const previous = storage.getItem(CHUNK_RELOAD_KEY)
    if (previous !== null && now - Number(previous) < CHUNK_RELOAD_COOLDOWN_MS) return false
    // Persist before navigation. If storage is unavailable, retain the manual
    // fallback rather than risk a loop on every mount of this error boundary.
    storage.setItem(CHUNK_RELOAD_KEY, String(now))
    reload()
    return true
  } catch {
    return false
  }
}
