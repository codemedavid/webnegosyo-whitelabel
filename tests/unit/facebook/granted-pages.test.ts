/** @jest-environment node */
import { getUserPages } from '@/lib/facebook-api'

type Route = (url: URL) => unknown

function mockGraph(route: Route) {
  global.fetch = jest.fn(async (input: string | URL) => {
    const url = new URL(String(input))
    const body = route(url)
    return { ok: body !== undefined, json: async () => body, text: async () => 'error' } as Response
  }) as typeof fetch
}

const SMARTMENU = { id: '596', name: 'SmartMenu', access_token: 'page-596' }
const LISTED = { id: '713', name: 'AI Taskforce PH', access_token: 'page-713' }

describe('getUserPages', () => {
  const originalEnv = process.env
  const originalFetch = global.fetch

  beforeEach(() => {
    process.env = { ...originalEnv, FACEBOOK_APP_ID: 'app', FACEBOOK_APP_SECRET: 'secret' }
  })
  afterEach(() => {
    process.env = originalEnv
    global.fetch = originalFetch
  })

  it('returns ONLY the pages the person granted, fetching a granted page /me/accounts left out', async () => {
    mockGraph((url) => {
      if (url.pathname.endsWith('/debug_token')) {
        return { data: { granular_scopes: [
          { scope: 'pages_show_list', target_ids: ['596'] },
          { scope: 'pages_messaging', target_ids: ['596'] },
          { scope: 'pages_read_engagement' },
        ] } }
      }
      if (url.pathname.endsWith('/me/accounts')) return { data: [LISTED] }
      if (url.pathname.endsWith('/596')) return SMARTMENU
      return undefined
    })

    expect(await getUserPages('user-token')).toEqual([SMARTMENU])
  })

  it('keeps listed pages that were granted without refetching them', async () => {
    mockGraph((url) => {
      if (url.pathname.endsWith('/debug_token')) {
        return { data: { granular_scopes: [{ scope: 'pages_messaging', target_ids: ['713'] }] } }
      }
      if (url.pathname.endsWith('/me/accounts')) return { data: [LISTED, SMARTMENU] }
      return undefined
    })

    expect(await getUserPages('user-token')).toEqual([LISTED])
    expect(jest.mocked(global.fetch).mock.calls.some(([u]) => String(u).includes('/713?'))).toBe(false)
  })

  it('falls back to /me/accounts when the grant cannot be read', async () => {
    mockGraph((url) => (url.pathname.endsWith('/me/accounts') ? { data: [LISTED] } : undefined))

    expect(await getUserPages('user-token')).toEqual([LISTED])
  })

  it('skips a granted page Facebook will not hand a token for', async () => {
    mockGraph((url) => {
      if (url.pathname.endsWith('/debug_token')) {
        return { data: { granular_scopes: [{ scope: 'pages_messaging', target_ids: ['596', '999'] }] } }
      }
      if (url.pathname.endsWith('/me/accounts')) return { data: [] }
      if (url.pathname.endsWith('/596')) return SMARTMENU
      if (url.pathname.endsWith('/999')) return { id: '999', name: 'No token' }
      return undefined
    })

    expect(await getUserPages('user-token')).toEqual([SMARTMENU])
  })
})
