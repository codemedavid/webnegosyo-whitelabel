import { createLogger, isDebugEnabled, type DebugFlags } from '@/lib/logger'

/**
 * The gate these tests pin is the whole point of the module: debug tracing is
 * OFF unless it is asked for by name. Tying it to `NODE_ENV === 'development'`
 * (what middleware.ts and tenant.ts each did inline) meant every local page
 * load printed the same tenant-resolution triplet, once per RSC prefetch —
 * noise that buries the `console.error` lines that actually matter.
 */

const noFlags: DebugFlags = {}

describe('isDebugEnabled', () => {
  test('returns false when no debug flag is set', () => {
    // Arrange / Act / Assert
    expect(isDebugEnabled('DEBUG_TENANT_RESOLUTION', noFlags)).toBe(false)
  })

  test('returns false in development when the flag is absent', () => {
    // Arrange
    const flags: DebugFlags = { NODE_ENV: 'development' }

    // Act / Assert — development alone must not turn tracing on
    expect(isDebugEnabled('DEBUG_TENANT_RESOLUTION', flags)).toBe(false)
  })

  test('returns true when the namespace flag is exactly "true"', () => {
    expect(isDebugEnabled('DEBUG_TENANT_RESOLUTION', { DEBUG_TENANT_RESOLUTION: 'true' })).toBe(true)
  })

  test('returns false when the namespace flag is any other value', () => {
    expect(isDebugEnabled('DEBUG_TENANT_RESOLUTION', { DEBUG_TENANT_RESOLUTION: '1' })).toBe(false)
    expect(isDebugEnabled('DEBUG_TENANT_RESOLUTION', { DEBUG_TENANT_RESOLUTION: 'false' })).toBe(false)
  })

  test('DEBUG_ALL turns on every namespace at once', () => {
    expect(isDebugEnabled('DEBUG_TENANT_RESOLUTION', { DEBUG_ALL: 'true' })).toBe(true)
    expect(isDebugEnabled('DEBUG_MIDDLEWARE', { DEBUG_ALL: 'true' })).toBe(true)
  })
})

describe('createLogger', () => {
  let logSpy: jest.SpyInstance
  let errorSpy: jest.SpyInstance

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('debug stays silent when the namespace is not enabled', () => {
    // Arrange
    const log = createLogger('[Tenant Resolution]', 'DEBUG_TENANT_RESOLUTION', () => noFlags)

    // Act
    log.debug('Tenant validated successfully', { slug: 'gungjeon-unlimited' })

    // Assert
    expect(logSpy).not.toHaveBeenCalled()
  })

  test('debug prefixes the label when the namespace is enabled', () => {
    // Arrange
    const log = createLogger('[Tenant Resolution]', 'DEBUG_TENANT_RESOLUTION', () => ({
      DEBUG_TENANT_RESOLUTION: 'true',
    }))

    // Act
    log.debug('Tenant validated successfully', { slug: 'gungjeon-unlimited' })

    // Assert
    expect(logSpy).toHaveBeenCalledWith('[Tenant Resolution] Tenant validated successfully', {
      slug: 'gungjeon-unlimited',
    })
  })

  test('debug omits the data argument entirely when none is given', () => {
    // Arrange
    const log = createLogger('[Tenant Resolution]', 'DEBUG_TENANT_RESOLUTION', () => ({
      DEBUG_ALL: 'true',
    }))

    // Act
    log.debug('No tenant found')

    // Assert — a trailing `undefined` in the console output is noise of its own
    expect(logSpy).toHaveBeenCalledWith('[Tenant Resolution] No tenant found')
    expect(logSpy.mock.calls[0]).toHaveLength(1)
  })

  test('error always logs, even with every debug flag off', () => {
    // Arrange — commit 2b1ce6b4 deliberately keeps middleware catch-block
    // errors visible in production logs; the gate must never reach them.
    const log = createLogger('[Middleware]', 'DEBUG_MIDDLEWARE', () => noFlags)
    const cause = new Error('GoTrue timed out')

    // Act
    log.error('Session lookup failed:', cause)

    // Assert
    expect(errorSpy).toHaveBeenCalledWith('[Middleware] Session lookup failed:', cause)
  })

  test('error omits the data argument when none is given', () => {
    // Arrange
    const log = createLogger('[Middleware]', 'DEBUG_MIDDLEWARE', () => noFlags)

    // Act
    log.error('Error resolving tenant')

    // Assert
    expect(errorSpy).toHaveBeenCalledWith('[Middleware] Error resolving tenant')
    expect(errorSpy.mock.calls[0]).toHaveLength(1)
  })

  test('reads the flags on every call, so enabling mid-process takes effect', () => {
    // Arrange — flags are read lazily rather than captured at module load,
    // which is what lets a test (or a running edge worker) flip them.
    const flags: DebugFlags = {}
    const log = createLogger('[Tenant Resolution]', 'DEBUG_TENANT_RESOLUTION', () => flags)

    // Act
    log.debug('first')
    flags.DEBUG_TENANT_RESOLUTION = 'true'
    log.debug('second')

    // Assert
    expect(logSpy).toHaveBeenCalledTimes(1)
    expect(logSpy).toHaveBeenCalledWith('[Tenant Resolution] second')
  })
})
