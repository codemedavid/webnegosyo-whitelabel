/**
 * jsdom gaps that Radix (Select, Switch, Dialog) and Recharts touch. Call
 * once at the top of a test file, before rendering.
 */
export function installDomPolyfills(): void {
  const proto = Element.prototype as unknown as Record<string, unknown>
  if (!proto.hasPointerCapture) proto.hasPointerCapture = () => false
  if (!proto.setPointerCapture) proto.setPointerCapture = () => undefined
  if (!proto.releasePointerCapture) proto.releasePointerCapture = () => undefined
  if (!proto.scrollIntoView) proto.scrollIntoView = () => undefined

  const globals = globalThis as unknown as Record<string, unknown>
  if (!globals.ResizeObserver) {
    globals.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
}

/** Pretend the viewport is a phone (false) or ≥640px (true). */
export function setWideScreen(isWide: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: isWide,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
}
