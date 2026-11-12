import * as SecureStore from 'expo-secure-store'
import type { PushChoice } from './push-state'

/**
 * What the customer chose about order notifications ON THIS PHONE. Small
 * flags, kept beside the session token; a storage failure reads as "never
 * chosen", never as a crash.
 */
const CHOICE_KEY = 'wn.customer.push.choice.v1'
const ASK_DISMISSED_KEY = 'wn.customer.push.askDismissed.v1'

async function read(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key)
  } catch {
    return null
  }
}

async function write(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value)
  } catch {
    // Remembered until the app closes.
  }
}

export async function loadPushPrefs(): Promise<{ choice: PushChoice; isAskDismissed: boolean }> {
  const [choice, dismissed] = await Promise.all([read(CHOICE_KEY), read(ASK_DISMISSED_KEY)])
  return { choice: choice === 'on' || choice === 'off' ? choice : 'unset', isAskDismissed: dismissed === 'yes' }
}

export const savePushChoice = (choice: 'on' | 'off') => write(CHOICE_KEY, choice)
export const saveAskDismissed = () => write(ASK_DISMISSED_KEY, 'yes')
