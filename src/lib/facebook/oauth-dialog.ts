const FACEBOOK_DIALOG_URL = 'https://www.facebook.com/v20.0/dialog/oauth'

/** Page permissions the Messenger integration needs (classic Facebook Login). */
export const FACEBOOK_PAGE_SCOPES = [
  'pages_show_list', // List user's pages
  'pages_messaging', // Send/receive messages
  'pages_manage_metadata', // Manage webhooks
] as const

interface FacebookDialogParams {
  appId: string
  redirectUri: string
  state: string
  /**
   * Facebook Login for Business configuration id. Business-type apps refuse
   * `scope` ("This app needs at least one supported permission"); the
   * configuration carries the permissions instead, so the two never mix.
   */
  configId: string | undefined
}

export function buildFacebookDialogUrl({ appId, redirectUri, state, configId }: FacebookDialogParams): string {
  const params = new URLSearchParams({ client_id: appId, redirect_uri: redirectUri })
  const trimmedConfigId = configId?.trim()

  if (trimmedConfigId) {
    params.set('config_id', trimmedConfigId)
  } else {
    params.set('scope', FACEBOOK_PAGE_SCOPES.join(','))
  }

  params.set('state', state)
  params.set('response_type', 'code')

  return `${FACEBOOK_DIALOG_URL}?${params.toString()}`
}
