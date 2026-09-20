import { recoverChunkLoad, isResourceLoadError, isInterruptedLoad } from '@/lib/client-resource-recovery'

describe('failed page resource recovery', () => {
  beforeEach(() => sessionStorage.clear())

  it('reloads a failed JavaScript chunk once and prevents a reload loop across mounts', () => {
    const error = new Error('Failed to load chunk /_next/static/chunks/old.js?dpl=old from module 123')
    const reload = jest.fn()
    expect(recoverChunkLoad(error, { storage: sessionStorage, reload, online: true, now: 1000 })).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(recoverChunkLoad(error, { storage: sessionStorage, reload, online: true, now: 2000 })).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does not automatically reload generic network errors, application exceptions, or offline pages', () => {
    const reload = jest.fn()
    for (const error of [new Error('Load failed'), new Error('Invalid payment'), new Error('Failed to fetch')]) {
      expect(recoverChunkLoad(error, { storage: sessionStorage, reload, online: true, now: 1000 })).toBe(false)
    }
    expect(recoverChunkLoad(new Error('Failed to load chunk /_next/static/chunks/page.js'), {
      storage: sessionStorage, reload, online: false, now: 1000,
    })).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('leaves manual recovery available when session storage cannot prevent reload loops', () => {
    const reload = jest.fn()
    const storage = { getItem: () => { throw new Error('Blocked') }, setItem: jest.fn() }
    expect(recoverChunkLoad(new Error('Loading chunk 123 failed.'), { storage, reload, online: true, now: 1000 })).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it.each(['Load failed', 'Failed to fetch dynamically imported module: /page.js', 'Loading chunk 123 failed.', 'Failed to load chunk /page.js'])('uses full reload recovery for %s', message => {
    expect(isResourceLoadError(new Error(message))).toBe(true)
  })
})

describe('interrupted load classification', () => {
  test('treats an aborted resource load in a backgrounded tab as an interruption', () => {
    // Arrange
    const error = new Error('Load failed')

    // Act
    const interrupted = isInterruptedLoad(error, { visibility: 'hidden', online: true })

    // Assert
    expect(interrupted).toBe(true)
  })

  test('treats an aborted resource load while offline as an interruption', () => {
    // Arrange
    const error = new Error('Load failed')

    // Act
    const interrupted = isInterruptedLoad(error, { visibility: 'visible', online: false })

    // Assert
    expect(interrupted).toBe(true)
  })

  test('reports a resource load that fails while visible and online as a real error', () => {
    // Arrange
    const error = new Error('Load failed')

    // Act
    const interrupted = isInterruptedLoad(error, { visibility: 'visible', online: true })

    // Assert
    expect(interrupted).toBe(false)
  })

  test('never reclassifies a non-resource error, even in a hidden tab', () => {
    // Arrange
    const error = new TypeError("Cannot read properties of undefined (reading 'id')")

    // Act
    const interrupted = isInterruptedLoad(error, { visibility: 'hidden', online: false })

    // Assert
    expect(interrupted).toBe(false)
  })
})
