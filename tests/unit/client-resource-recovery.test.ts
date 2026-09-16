import { recoverChunkLoad, isResourceLoadError } from '@/lib/client-resource-recovery'

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
