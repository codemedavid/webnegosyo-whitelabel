let failedResource: { path: string; at: number } | undefined

/** Observe resource failures without fetching, retaining form data, or suppressing errors. */
export function installResourceFailureDiagnostics(): () => void {
  if (typeof window === 'undefined') return () => {}
  const onError = (event: Event) => {
    const target = event.target
    const source = target instanceof HTMLScriptElement ? target.src
      : target instanceof HTMLLinkElement ? target.href : undefined
    if (!source) return
    try {
      const url = new URL(source, window.location.origin)
      if (url.origin === window.location.origin && url.pathname.startsWith('/_next/static/')) {
        failedResource = { path: url.pathname, at: Date.now() }
      }
    } catch {
      // A malformed resource URL must not interfere with the page.
    }
  }
  window.addEventListener('error', onError, true)
  return () => window.removeEventListener('error', onError, true)
}

export function getResourceFailureContext() {
  if (typeof window === 'undefined') return undefined
  return {
    online: navigator.onLine,
    visibility: document.visibilityState,
    ...(failedResource && Date.now() - failedResource.at < 60_000
      ? { failedResource: failedResource.path } : {}),
  }
}
