import { handleAppleWebService, type AppleWsDeps, type AppleWsRequest } from '@/lib/loyalty/wallet-pass/apple-ws-handler'
import { deriveAppleAuthToken } from '@/lib/loyalty/wallet-pass/auth-token'

const SECRET = Buffer.alloc(32, 9)
const TYPE = 'pass.com.webnegosyo.loyalty'
const SERIAL = 'D'.repeat(24)
const DEVICE = 'device123'
const AUTH = `ApplePass ${deriveAppleAuthToken(SECRET, SERIAL)}`
const PASS = { id: 'pass-1', serial: SERIAL, contentUpdatedAt: '2026-09-29T10:00:00.500Z' }

function deps(overrides: Partial<AppleWsDeps> = {}): AppleWsDeps {
  return {
    passTypeIdentifier: TYPE,
    authSecret: SECRET,
    findPass: jest.fn(async (serial: string) => (serial === SERIAL ? PASS : null)),
    register: jest.fn(async () => true),
    unregister: jest.fn(async () => undefined),
    listUpdated: jest.fn(async () => []),
    buildLatest: jest.fn(async () => ({ pkpass: Buffer.from('zip'), updatedAt: PASS.contentUpdatedAt })),
    log: jest.fn(),
    ...overrides,
  }
}

function request(overrides: Partial<AppleWsRequest> = {}): AppleWsRequest {
  return { authorization: AUTH, body: null, ifModifiedSince: null, passesUpdatedSince: null, ...overrides }
}

const register = { kind: 'register', deviceId: DEVICE, passTypeId: TYPE, serial: SERIAL } as const

describe('register', () => {
  test('a new device is 201, a repeat is 200', async () => {
    const d = deps()
    expect(await handleAppleWebService(register, request({ body: { pushToken: 'abc123' } }), d)).toEqual({ status: 201 })
    expect(d.register).toHaveBeenCalledWith('pass-1', DEVICE, 'abc123')

    const repeat = deps({ register: jest.fn(async () => false) })
    expect(await handleAppleWebService(register, request({ body: { pushToken: 'abc123' } }), repeat)).toEqual({ status: 200 })
  })

  test('the token for another serial is refused', async () => {
    const d = deps()
    const other = `ApplePass ${deriveAppleAuthToken(SECRET, 'E'.repeat(24))}`
    expect(await handleAppleWebService(register, request({ authorization: other, body: { pushToken: 'abc' } }), d)).toEqual({ status: 401 })
    expect(d.register).not.toHaveBeenCalled()
  })

  test('a pass type that is not ours is refused', async () => {
    const d = deps()
    expect(await handleAppleWebService({ ...register, passTypeId: 'pass.other' }, request({ body: { pushToken: 'abc' } }), d))
      .toEqual({ status: 401 })
  })

  test('a malformed push token is a 400', async () => {
    expect(await handleAppleWebService(register, request({ body: { pushToken: 'no spaces allowed' } }), deps())).toEqual({ status: 400 })
  })
})

test('unregister needs the pass token too', async () => {
  const d = deps()
  const route = { ...register, kind: 'unregister' } as const
  expect(await handleAppleWebService(route, request({ authorization: null }), d)).toEqual({ status: 401 })
  expect(await handleAppleWebService(route, request(), d)).toEqual({ status: 200 })
  expect(d.unregister).toHaveBeenCalledWith('pass-1', DEVICE)
})

describe('list_updated', () => {
  const route = { kind: 'list_updated', deviceId: DEVICE, passTypeId: TYPE } as const

  test('nothing new is a 204', async () => {
    expect(await handleAppleWebService(route, request(), deps())).toEqual({ status: 204 })
  })

  test('returns the changed serials and the newest tag', async () => {
    const d = deps({
      listUpdated: jest.fn(async () => [
        { serial: SERIAL, updatedAt: '2026-09-29T10:00:00.000Z' },
        { serial: 'F'.repeat(24), updatedAt: '2026-09-29T11:00:00.000Z' },
      ]),
    })
    expect(await handleAppleWebService(route, request({ passesUpdatedSince: '2026-09-29T09:00:00.000Z' }), d)).toEqual({
      status: 200,
      json: { serialNumbers: [SERIAL, 'F'.repeat(24)], lastUpdated: '2026-09-29T11:00:00.000Z' },
    })
    expect(d.listUpdated).toHaveBeenCalledWith(DEVICE, '2026-09-29T09:00:00.000Z')
  })

  test('a garbage tag lists everything rather than erroring', async () => {
    const d = deps()
    await handleAppleWebService(route, request({ passesUpdatedSince: 'not-a-date' }), d)
    expect(d.listUpdated).toHaveBeenCalledWith(DEVICE, null)
  })
})

describe('latest_pass', () => {
  const route = { kind: 'latest_pass', passTypeId: TYPE, serial: SERIAL } as const

  test('returns the signed pass with Last-Modified', async () => {
    const response = await handleAppleWebService(route, request(), deps())
    expect(response).toEqual({ status: 200, pkpass: Buffer.from('zip'), lastModified: 'Tue, 29 Sep 2026 10:00:00 GMT' })
  })

  test('304 when the device already has this version (second precision)', async () => {
    const d = deps()
    expect(await handleAppleWebService(route, request({ ifModifiedSince: 'Tue, 29 Sep 2026 10:00:00 GMT' }), d)).toEqual({ status: 304 })
    expect(d.buildLatest).not.toHaveBeenCalled()
  })

  test('an older If-Modified-Since gets the new pass', async () => {
    const response = await handleAppleWebService(route, request({ ifModifiedSince: 'Tue, 29 Sep 2026 09:59:59 GMT' }), deps())
    expect(response.status).toBe(200)
  })

  test('no token, no pass', async () => {
    expect(await handleAppleWebService(route, request({ authorization: 'ApplePass nope' }), deps())).toEqual({ status: 401 })
  })
})

test('device logs are bounded', async () => {
  const d = deps()
  await handleAppleWebService({ kind: 'log' }, request({ body: { logs: Array(50).fill('x'.repeat(1000)) } }), d)
  const lines = (d.log as jest.Mock).mock.calls[0][0] as string[]
  expect(lines).toHaveLength(20)
  expect(lines[0]).toHaveLength(500)
})
