import * as Application from 'expo-application'
import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { APP_ORDER_PUSH_CHANNEL, type AppPushPlatform } from '@/lib/contract'
import type { PushPermission } from './push-state'

/**
 * The phone side of notifications, kept thin so the rules around it
 * (push-actions, push-state) are testable without native modules.
 */

/** The EAS project this build belongs to; Expo Go test builds have none and can't get a push token. */
export function pushProjectId(): string | null {
  const fromExtra = (Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined)?.eas?.projectId
  const projectId = typeof fromExtra === 'string' ? fromExtra : Constants.easConfig?.projectId
  return typeof projectId === 'string' && projectId.trim() !== '' ? projectId : null
}

function toPermission(status: Notifications.NotificationPermissionsStatus): PushPermission {
  if (status.granted) return 'granted'
  // iOS "provisional" (quiet delivery) counts as allowed.
  if (status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return 'granted'
  return status.canAskAgain && status.status !== 'denied' ? 'undetermined' : 'denied'
}

export async function readPermission(): Promise<PushPermission> {
  try {
    return toPermission(await Notifications.getPermissionsAsync())
  } catch {
    return 'undetermined'
  }
}

/** Android 13+ asks only once a channel exists, so the channel is made first. */
export async function askPermission(): Promise<PushPermission> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(APP_ORDER_PUSH_CHANNEL, {
      name: 'Order updates',
      importance: Notifications.AndroidImportance.HIGH,
    })
  }
  return toPermission(await Notifications.requestPermissionsAsync())
}

export interface DevicePushToken {
  token: string
  platform: AppPushPlatform
  appVersion: string | null
}

/** null when this build can't get one (no project id, simulator, no network). */
export async function readPushToken(): Promise<DevicePushToken | null> {
  const projectId = pushProjectId()
  if (!projectId || (Platform.OS !== 'ios' && Platform.OS !== 'android')) return null
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId })
    return { token: data, platform: Platform.OS, appVersion: Application.nativeApplicationVersion ?? null }
  } catch (error) {
    console.warn('[push] no push token', error instanceof Error ? error.message : error)
    return null
  }
}
