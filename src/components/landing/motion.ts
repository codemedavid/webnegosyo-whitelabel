/**
 * Motion guards for the landing surface. `matchMedia` is absent in jsdom and in
 * some embedded webviews, so every animated component asks through here rather
 * than touching the API directly.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
