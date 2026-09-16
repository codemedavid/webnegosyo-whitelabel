import { filterSentryClientEvent, filterSentryEvent, SENTRY_DENY_URLS, SENTRY_IGNORE_ERRORS } from '@/lib/sentry-filtering'

describe('Sentry production crash visibility', () => {
  it('drops only the disposed Facebook Android performance bridge error', () => {
    const bridgeEvent = { exception: { values: [{
      value: 'Error invoking postMessage: Java object is gone',
      stacktrace: { frames: [{ filename: 'app://navigation_performance_logger_android' }] },
    }] } }
    expect(filterSentryEvent(bridgeEvent)).toBeNull()
    const appEvent = { exception: { values: [{
      value: 'Error invoking postMessage: Java object is gone',
      stacktrace: { frames: [{ filename: 'app:///_next/static/chunks/app.js' }] },
    }] } }
    expect(filterSentryEvent(appEvent)).toBe(appEvent)
    expect(filterSentryEvent({ message: 'Error invoking postMessage: Java object is gone' })).not.toBeNull()
  })

  it.each([
    'Module [project]/src/app/page.tsx was instantiated because it was required from module, but the module factory is not available',
    'Failed to fetch dynamically imported module: https://www.webnegosyo.com/_next/static/chunks/page.js',
    'Load failed',
    'Failed to fetch',
    'Order cancelled unexpectedly',
  ])('keeps actionable exceptions: %s', (value) => {
    const event = { exception: { values: [{ type: 'Error', value }] } }
    expect(filterSentryEvent(event)).toBe(event)
    expect(SENTRY_IGNORE_ERRORS.some(pattern => typeof pattern === 'string' ? value.includes(pattern) : pattern.test(value))).toBe(false)
  })

  it('keeps application crashes with production Turbopack runtime frames', () => {
    const filename = 'https://www.webnegosyo.com/_next/static/chunks/[turbopack]-runtime.js'
    const event = { exception: { values: [{ value: 'Cannot read properties of undefined', stacktrace: { frames: [{ filename }] } }] } }
    expect(filterSentryEvent(event)).toBe(event)
    expect(SENTRY_DENY_URLS.some(pattern => pattern.test(filename))).toBe(false)
  })

  it('still drops ResizeObserver loop notifications and extension script URLs', () => {
    expect(filterSentryEvent({ message: 'ResizeObserver loop limit exceeded' })).toBeNull()
    expect(SENTRY_DENY_URLS.some(pattern => pattern.test('chrome-extension://extension/content.js'))).toBe(true)
  })
})

describe('browser crash context', () => {
  afterEach(() => window.history.replaceState(null, '', '/'))

  it.each([
    ['/test-store/admin/orders', 'admin', 'test-store'],
    ['/test-store/menu', 'storefront', 'test-store'],
    ['/admin/orders', 'admin', undefined],
    ['/menu/item/123', 'storefront', undefined],
    ['/superadmin/settings', 'superadmin', undefined],
  ])('identifies the application area at %s without copying query credentials', (path, surface, tenantSlug) => {
    window.history.replaceState(null, '', `${path}?token=private-token`)
    const result = filterSentryClientEvent({ message: 'Unexpected failure', tags: { errorBoundary: 'tenant' } })
    expect(result?.tags).toEqual({ errorBoundary: 'tenant', appSurface: surface, ...(tenantSlug ? { tenantSlug } : {}) })
    expect(JSON.stringify(result)).not.toContain('private-token')
  })
})
