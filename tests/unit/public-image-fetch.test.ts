/** @jest-environment node */
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { lookup } from 'node:dns'
import { request } from 'node:https'
import { requestPublicImage } from '@/lib/public-image-fetch'
import { assertPublicHttpUrl } from '@/lib/imagekit-remote'

jest.mock('node:dns', () => ({ lookup: jest.fn() }))
jest.mock('node:https', () => ({ request: jest.fn() }))

const mockRequest = jest.mocked(request)
const mockLookup = jest.mocked(lookup)

function respond(chunks: Buffer[], headers: Record<string, string> = {}, statusCode = 200) {
  mockRequest.mockImplementation(((_url: unknown, _options: unknown, callback: (response: unknown) => void) => {
    const response = Object.assign(Readable.from(chunks), { headers, statusCode })
    const req = Object.assign(new EventEmitter(), { end: () => callback(response) })
    return req
  }) as typeof request)
}

function download(maxBytes = 8) {
  return requestPublicImage(new URL('https://cdn.example.com/a.png'), {
    assertUrl: assertPublicHttpUrl, maxBytes, signal: AbortSignal.timeout(1000),
  })
}

beforeEach(() => jest.clearAllMocks())

test('pins DNS to the checked lookup result instead of resolving a second time', async () => {
  respond([Buffer.from('png')], { 'content-type': 'image/png' })
  await download()
  const options = mockRequest.mock.calls[0][1] as { lookup: (host: string, options: object, cb: jest.Mock) => void; agent: boolean }
  expect(options.agent).toBe(false)
  mockLookup.mockImplementation(((_host: string, _options: unknown, cb: (error: null, addresses: unknown[]) => void) => {
    cb(null, [{ address: '93.184.216.34', family: 4 }])
  }) as typeof lookup)
  const callback = jest.fn()
  options.lookup('cdn.example.com', { all: true }, callback)
  expect(callback).toHaveBeenCalledWith(null, [{ address: '93.184.216.34', family: 4 }])
  expect(mockLookup).toHaveBeenCalledTimes(1)
})

test.each(['127.0.0.1', '169.254.169.254', '::ffff:7f00:1'])('blocks DNS resolving to %s at socket connection', async (address) => {
  respond([])
  await download()
  const options = mockRequest.mock.calls[0][1] as { lookup: (host: string, options: object, cb: jest.Mock) => void }
  mockLookup.mockImplementation(((_host: string, _options: unknown, cb: (error: null, addresses: unknown[]) => void) => {
    cb(null, [{ address, family: address.includes(':') ? 6 : 4 }])
  }) as typeof lookup)
  const callback = jest.fn()
  options.lookup('cdn.example.com', {}, callback)
  expect(callback.mock.calls[0][0]).toBeInstanceOf(Error)
})

test('stops a chunked response as soon as it exceeds the byte limit', async () => {
  respond([Buffer.alloc(5), Buffer.alloc(5), Buffer.alloc(5)])
  await expect(download()).rejects.toThrow(/too large/i)
})

test('rejects an oversized declared body before buffering it', async () => {
  respond([], { 'content-length': '100' })
  await expect(download()).rejects.toThrow(/too large/i)
})

test('returns redirects without downloading their bodies', async () => {
  respond([Buffer.alloc(100)], { location: 'http://127.0.0.1/' }, 302)
  const response = await download()
  expect(response.status).toBe(302)
  expect(response.headers.get('location')).toBe('http://127.0.0.1/')
})
