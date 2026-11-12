import { AppApiError } from '@/lib/api/app-client'
import { createLiveAuth, createPrototypeAuth } from './auth-source'

const PROFILE = { name: null, phoneE164: '+639171234567' }

function fakeClient() {
  return {
    get: jest.fn().mockResolvedValue(PROFILE),
    send: jest.fn().mockResolvedValue({ challengeId: 'c1' }),
  }
}

describe('createLiveAuth', () => {
  it('requests a code for the number, without a session', async () => {
    const client = fakeClient()
    await createLiveAuth(client).requestCode('+639171234567')
    expect(client.send).toHaveBeenCalledWith('POST', '/api/app/v1/auth/otp/request', expect.anything(), { body: { phone: '+639171234567' } })
  })

  it('verifies with the challenge, number and code', async () => {
    const client = fakeClient()
    await createLiveAuth(client).verifyCode({ challengeId: 'c1', phoneE164: '+639171234567', code: '482913' })
    expect(client.send).toHaveBeenCalledWith('POST', '/api/app/v1/auth/otp/verify', expect.anything(), {
      body: { challengeId: 'c1', phone: '+639171234567', code: '482913' },
    })
  })

  it('reads, renames, signs out and deletes as the signed-in customer', async () => {
    const client = fakeClient()
    const auth = createLiveAuth(client)
    await auth.getProfile('cs1.t')
    await auth.updateName('cs1.t', 'Angelo')
    await auth.signOut('cs1.t')
    await auth.deleteAccount('cs1.t')
    expect(client.get).toHaveBeenCalledWith('/api/app/v1/me', expect.anything(), { token: 'cs1.t' })
    expect(client.send.mock.calls.map(([method, path, , options]) => [method, path, options.token])).toEqual([
      ['PATCH', '/api/app/v1/me', 'cs1.t'],
      ['DELETE', '/api/app/v1/auth/session', 'cs1.t'],
      ['DELETE', '/api/app/v1/me', 'cs1.t'],
    ])
  })
})

describe('createPrototypeAuth', () => {
  jest.useFakeTimers()
  const settle = async <T,>(promise: Promise<T>) => {
    jest.runAllTimers()
    return promise
  }

  it('refuses 000000 as a wrong code and signs anything else in', async () => {
    const auth = createPrototypeAuth()
    await expect(settle(auth.verifyCode({ challengeId: 'c', phoneE164: PROFILE.phoneE164, code: '000000' }))).rejects.toBeInstanceOf(AppApiError)
    const result = await settle(auth.verifyCode({ challengeId: 'c', phoneE164: PROFILE.phoneE164, code: '482913' }))
    expect(result).toMatchObject({ isNewCustomer: true, profile: PROFILE })
  })

  it('remembers the name, and forgets the customer after deleting the account', async () => {
    const auth = createPrototypeAuth()
    const { token } = await settle(auth.verifyCode({ challengeId: 'c', phoneE164: PROFILE.phoneE164, code: '482913' }))
    await expect(auth.updateName(token, '  Angelo ')).resolves.toMatchObject({ name: 'Angelo' })
    await auth.deleteAccount(token)
    await expect(auth.getProfile(token)).rejects.toMatchObject({ code: 'unauthorized' })
  })
})
