package expo.modules.smssender

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Restarts the SMS gateway after a reboot or an app update, if the merchant
 * left it on. Both broadcasts are exempt from Android 12's background
 * foreground-service start restriction, and `specialUse` is not one of the
 * service types Android 15 forbids from BOOT_COMPLETED.
 */
class LoyaltySmsGatewayBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action
    if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) return
    if (SmsGatewayPrefs.read(context) == null) return
    // No wake lock here: the broadcast holds the CPU while onReceive runs and
    // the service takes its own once the task starts. Pre-acquiring the shared
    // HeadlessJsTaskService lock would leak it if this start were refused.
    runCatching { LoyaltySmsGatewayService.start(context) }
  }
}
