import type { MapKit } from '@/lib/maps/apple/mapkit-types'

type LoaderModule = typeof import('@/lib/maps/apple/mapkit-loader')

function fakeMapKit(): MapKit & { init: jest.Mock } {
  return { init: jest.fn(), loadedLibraries: [] } as unknown as MapKit & { init: jest.Mock }
}

function respond(status: number, body = 'token-1') {
  return { ok: status >= 200 && status < 300, status, text: async () => body }
}

async function freshLoader(): Promise<LoaderModule> {
  let loader: LoaderModule | undefined
  jest.isolateModules(() => {
    loader = jest.requireActual<LoaderModule>('@/lib/maps/apple/mapkit-loader')
  })
  return loader as LoaderModule
}

/** Plays the CDN: once the script tag lands, expose `mapkit` and fire the ready callback. */
function serveScriptOnInsert(mapkit: MapKit) {
  const observer = new MutationObserver(() => {
    const script = document.head.querySelector<HTMLScriptElement>('script[data-callback]')
    if (!script) return
    observer.disconnect()
    window.mapkit = mapkit
    const callback = (window as unknown as Record<string, () => void>)[script.dataset.callback ?? '']
    callback()
  })
  observer.observe(document.head, { childList: true })
}

beforeEach(() => {
  document.head.innerHTML = ''
  delete window.mapkit
  global.fetch = jest.fn() as unknown as typeof fetch
})

it('loads MapKit once, with the first token served from the availability probe', async () => {
  const { loadMapKit } = await freshLoader()
  const mapkit = fakeMapKit()
  jest.mocked(global.fetch).mockResolvedValue(respond(200, 'token-1') as unknown as Response)
  serveScriptOnInsert(mapkit)

  const [first, second] = await Promise.all([loadMapKit(), loadMapKit()])

  expect(first).toBe(mapkit)
  expect(second).toBe(mapkit)
  expect(document.head.querySelectorAll('script').length).toBe(1)
  const script = document.head.querySelector('script') as HTMLScriptElement
  expect(script.src).toBe('https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.core.js')
  expect(script.dataset.libraries).toBe('map,annotations,services')

  const { authorizationCallback } = mapkit.init.mock.calls[0][0]
  const done = jest.fn()
  authorizationCallback(done)
  expect(done).toHaveBeenCalledWith('token-1')
  expect(global.fetch).toHaveBeenCalledTimes(1)
})

it('fetches a fresh token each time MapKit asks again', async () => {
  const { loadMapKit } = await freshLoader()
  const mapkit = fakeMapKit()
  jest
    .mocked(global.fetch)
    .mockResolvedValueOnce(respond(200, 'token-1') as unknown as Response)
    .mockResolvedValueOnce(respond(200, 'token-2') as unknown as Response)
  serveScriptOnInsert(mapkit)
  await loadMapKit()

  const { authorizationCallback } = mapkit.init.mock.calls[0][0]
  authorizationCallback(jest.fn())
  const done = jest.fn()
  authorizationCallback(done)
  await new Promise((resolve) => setTimeout(resolve, 0))

  expect(done).toHaveBeenCalledWith('token-2')
})

it('reports "unconfigured" and stops probing when the server has no MapKit key', async () => {
  const { loadMapKit, isMapKitUnconfiguredError } = await freshLoader()
  jest.mocked(global.fetch).mockResolvedValue(respond(503) as unknown as Response)

  const error = await loadMapKit().catch((caught: unknown) => caught)
  await loadMapKit().catch(() => undefined)

  expect(isMapKitUnconfiguredError(error)).toBe(true)
  expect(global.fetch).toHaveBeenCalledTimes(1)
  expect(document.head.querySelector('script')).toBeNull()
})

it('retries after a transient failure', async () => {
  const { loadMapKit, isMapKitUnconfiguredError } = await freshLoader()
  jest.mocked(global.fetch).mockRejectedValueOnce(new Error('offline'))

  const error = await loadMapKit().catch((caught: unknown) => caught)
  expect(isMapKitUnconfiguredError(error)).toBe(false)

  const mapkit = fakeMapKit()
  jest.mocked(global.fetch).mockResolvedValue(respond(200) as unknown as Response)
  serveScriptOnInsert(mapkit)
  await expect(loadMapKit()).resolves.toBe(mapkit)
})
