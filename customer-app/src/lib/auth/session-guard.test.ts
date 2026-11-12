import { AppApiError } from '@/lib/api/app-client'
import { useSession } from '@/lib/stores/session'
import { setSessionRefusedHandler, withSession } from './session-guard'

const profile = { name: 'Ana', phoneE164: '+639171234567' }

describe('withSession', () => {
  afterEach(() => {
    setSessionRefusedHandler(null)
    useSession.getState().setGuest()
  })

  it('refuses without calling out when nobody is signed in', async () => {
    const run = jest.fn()
    await expect(withSession(run)).rejects.toMatchObject({ code: 'unauthorized' })
    expect(run).not.toHaveBeenCalled()
  })

  it('passes the token and hands a refused session to the sign-out handler', async () => {
    const handler = jest.fn().mockResolvedValue(undefined)
    setSessionRefusedHandler(handler)
    useSession.getState().setMember('cs1.one', profile)
    await expect(withSession(async (token) => token)).resolves.toBe('cs1.one')
    await expect(withSession(() => Promise.reject(new AppApiError('unauthorized', 'gone')))).rejects.toMatchObject({ code: 'unauthorized' })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('never signs out on other errors, or when a newer session replaced the one that failed', async () => {
    const handler = jest.fn().mockResolvedValue(undefined)
    setSessionRefusedHandler(handler)
    useSession.getState().setMember('cs1.old', profile)
    await expect(withSession(() => Promise.reject(new AppApiError('refused', 'closed')))).rejects.toMatchObject({ code: 'refused' })
    await expect(
      withSession(async () => {
        useSession.getState().setMember('cs1.new', profile)
        throw new AppApiError('unauthorized', 'old one')
      }),
    ).rejects.toMatchObject({ code: 'unauthorized' })
    expect(handler).not.toHaveBeenCalled()
  })
})
