/**
 * Android 13+ hides a foreground service's notification unless the app may
 * post notifications. The gateway runs either way; asking is only so the
 * merchant can SEE that it is on. Never blocks enabling the gateway.
 *
 * Not pure (imports react-native), so tests stub it.
 */

import { PermissionsAndroid, Platform } from "react-native";

const ANDROID_TIRAMISU = 33;

export async function requestGatewayNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== "android" || Number(Platform.Version) < ANDROID_TIRAMISU) return true;
  try {
    const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
    if (await PermissionsAndroid.check(permission)) return true;
    return (await PermissionsAndroid.request(permission)) === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}
