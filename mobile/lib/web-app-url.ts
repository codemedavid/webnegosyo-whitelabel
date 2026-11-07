import Constants from 'expo-constants'

/**
 * Where the platform web app lives. Public by nature (it is the URL of the
 * site); holds no secret. Shared by every call this app makes to the web API.
 */
export function getWebAppUrl(): string {
  return (
    (Constants.expoConfig?.extra?.webAppUrl as string | undefined) ||
    process.env.EXPO_PUBLIC_WEB_APP_URL ||
    'https://webnegosyo.com'
  )
}
