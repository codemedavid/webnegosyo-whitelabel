import { buildFacebookDialogUrl, FACEBOOK_PAGE_SCOPES } from '@/lib/facebook/oauth-dialog'

const base = {
  appId: 'app-1',
  redirectUri: 'https://www.webnegosyo.com/api/auth/facebook/callback',
  state: 'payload.sig/+=',
}

describe('buildFacebookDialogUrl', () => {
  it('asks for the page scopes when no Login for Business configuration is set', () => {
    const url = new URL(buildFacebookDialogUrl({ ...base, configId: undefined }))

    expect(url.origin + url.pathname).toBe('https://www.facebook.com/v20.0/dialog/oauth')
    expect(url.searchParams.get('scope')).toBe(FACEBOOK_PAGE_SCOPES.join(','))
    expect(url.searchParams.has('config_id')).toBe(false)
  })

  it('sends config_id INSTEAD of scope for a Login for Business configuration', () => {
    const url = new URL(buildFacebookDialogUrl({ ...base, configId: '987' }))

    expect(url.searchParams.get('config_id')).toBe('987')
    expect(url.searchParams.has('scope')).toBe(false)
  })

  it('ignores a blank configuration id', () => {
    const url = new URL(buildFacebookDialogUrl({ ...base, configId: '  ' }))

    expect(url.searchParams.has('config_id')).toBe(false)
    expect(url.searchParams.get('scope')).toBe(FACEBOOK_PAGE_SCOPES.join(','))
  })

  it('keeps client, redirect, state and the code response type intact', () => {
    const url = new URL(buildFacebookDialogUrl({ ...base, configId: '987' }))

    expect(url.searchParams.get('client_id')).toBe('app-1')
    expect(url.searchParams.get('redirect_uri')).toBe(base.redirectUri)
    expect(url.searchParams.get('state')).toBe(base.state)
    expect(url.searchParams.get('response_type')).toBe('code')
  })
})
