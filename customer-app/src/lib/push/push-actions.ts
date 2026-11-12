import { create } from 'zustand'
import { withSession } from '@/lib/auth/session-guard'
import { appClientFromEnv } from '@/lib/data/live-source'
import { useSession } from '@/lib/stores/session'
import { askPermission, pushProjectId, readPermission, readPushToken } from './notifications'
import { loadPushPrefs, saveAskDismissed, savePushChoice } from './push-prefs'
import { createLivePush, createPrototypePush, type PushSource } from './push-source'
import { wantsRegistration, type PushPermission, type PushSnapshot } from './push-state'

/**
 * Order notifications on this phone (P7). The OS permission is asked only
 * when the customer taps "Turn on" (on their first order's screen, or in
 * Account) — never at launch. Signing out needs nothing here: the store drops
 * the session's tokens with the session.
 */

interface PushStore extends PushSnapshot {
  isLoaded: boolean
}

export const usePush = create<PushStore>(() => ({
  permission: 'undetermined',
  choice: 'unset',
  isAskDismissed: false,
  canPush: pushProjectId() !== null,
  isLoaded: false,
}))

const client = appClientFromEnv()
const push: PushSource = client ? createLivePush(client) : createPrototypePush()

let loading: Promise<void> | null = null

/** Reads the phone's permission and this app's saved choices once. */
export function loadPushState(): Promise<void> {
  loading ??= (async () => {
    const [permission, prefs] = await Promise.all([readPermission(), loadPushPrefs()])
    usePush.setState({ permission, ...prefs, isLoaded: true })
  })()
  return loading
}

/** After a visit to the phone's Settings, the permission may have changed. */
export async function refreshPushPermission(): Promise<PushPermission> {
  const permission = await readPermission()
  usePush.setState({ permission })
  return permission
}

/**
 * Files this install's token under the session signed in now. Run at launch,
 * after sign-in and after "Turn on"; it re-files a rotated token and moves a
 * shared phone to the account that just signed in. Never throws.
 */
export async function syncPushRegistration(): Promise<void> {
  try {
    await loadPushState()
    if (!wantsRegistration(usePush.getState(), useSession.getState().status === 'member')) return
    const device = await readPushToken()
    if (!device) return
    await withSession((session) => push.register(session, device))
  } catch {
    // Offline or refused: the next launch or sign-in tries again; the order screen still refreshes itself.
  }
}

/** "Turn on": asks the phone (a no-op prompt if already allowed), then registers. */
export async function turnOnNotifications(): Promise<PushPermission> {
  await loadPushState()
  let permission: PushPermission
  try {
    permission = await askPermission()
  } catch {
    permission = await readPermission()
  }
  if (permission === 'granted') await savePushChoice('on')
  usePush.setState((state) => ({ permission, choice: permission === 'granted' ? 'on' : state.choice }))
  if (permission === 'granted') await syncPushRegistration()
  return permission
}

/** "Not now" on the order card: the card stays away; Account can still turn it on. */
export async function dismissNotificationAsk(): Promise<void> {
  usePush.setState({ isAskDismissed: true })
  await saveAskDismissed()
}

/** The Account switch, off: this phone stops getting this account's order pushes. */
export async function turnOffNotifications(): Promise<void> {
  usePush.setState({ choice: 'off' })
  await savePushChoice('off')
  if (useSession.getState().status !== 'member') return
  await withSession((session) => push.remove(session)).catch(() => undefined)
}
