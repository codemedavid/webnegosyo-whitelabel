import * as SecureStore from 'expo-secure-store'

/**
 * The customer's session token lives in the OS keychain / keystore, never in
 * AsyncStorage. Storage failures (locked device, simulator quirks) degrade to
 * "signed out", never to a crash.
 */
const SESSION_KEY = 'wn.customer.session.v1'

export async function loadSessionToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SESSION_KEY)
  } catch {
    return null
  }
}

export async function saveSessionToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(SESSION_KEY, token)
  } catch {
    // The session still works until the app is closed.
  }
}

export async function clearSessionToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SESSION_KEY)
  } catch {
    // Nothing stored, or the store is unavailable; either way nothing to clear.
  }
}
