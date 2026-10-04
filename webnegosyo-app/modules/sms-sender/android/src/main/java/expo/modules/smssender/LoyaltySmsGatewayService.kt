package expo.modules.smssender

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * "Use this phone as an SMS gateway" for loyalty reward codes.
 *
 * A foreground service, so Android keeps the process (and its network access
 * and partial wake lock) alive through screen-off and Doze, with the app
 * closed and after a reboot. It does no SMS work itself: it hosts the headless
 * JS task `LoyaltySmsGateway` (lib/loyalty/sms-gateway-task.ts), which runs the
 * same tested delivery worker the app has always used and sends through
 * [SmsSenderModule]. Keeping the protocol in TypeScript is deliberate — this
 * file is the only gateway code that cannot be unit-tested off a device.
 *
 * Every start re-runs the task; the JS side supersedes an older run, so a
 * quick off/on never leaves two senders. The wake lock is HeadlessJsTaskService's
 * own (acquired on start, released in onDestroy).
 */
class LoyaltySmsGatewayService : HeadlessJsTaskService() {
  override fun onCreate() {
    super.onCreate()
    isRunning = true
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // startForegroundService() must be answered with startForeground() within
    // seconds, even when we are about to stop again.
    promoteToForeground(this, SmsGatewayPrefs.statusText(this))
    // Read the switch ONCE: a second read (the base class's getTaskConfig)
    // could see it turned off in between and leave the service up with no task.
    val config = SmsGatewayPrefs.read(this)
    if (config == null) {
      stopSelf()
      return START_NOT_STICKY
    }
    val data = Arguments.createMap().apply {
      putString("tenantId", config.tenantId)
      putString("actorId", config.actorId)
    }
    // timeout 0 = no timeout; allowed in foreground because the merchant
    // usually switches it on with the app open.
    startTask(HeadlessJsTaskConfig(TASK_NAME, data, 0, true))
    return START_REDELIVER_INTENT
  }

  override fun onDestroy() {
    isRunning = false
    super.onDestroy()
  }

  companion object {
    const val TASK_NAME = "LoyaltySmsGateway"
    private const val CHANNEL_ID = "loyalty_sms_gateway"
    private const val NOTIFICATION_ID = 0x5A6E

    @Volatile
    var isRunning: Boolean = false
      private set

    fun start(context: Context) {
      ContextCompat.startForegroundService(context, Intent(context, LoyaltySmsGatewayService::class.java))
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, LoyaltySmsGatewayService::class.java))
    }

    /** Replace the notification text while the service runs. */
    fun updateStatus(context: Context) {
      if (!isRunning) return
      runCatching {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID, buildNotification(context, SmsGatewayPrefs.statusText(context)))
      }
    }

    private fun promoteToForeground(service: LoyaltySmsGatewayService, text: String) {
      val notification = buildNotification(service, text)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        service.startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
      } else {
        service.startForeground(NOTIFICATION_ID, notification)
      }
    }

    private fun buildNotification(context: Context, text: String): Notification {
      ensureChannel(context)
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      val open = launch?.let {
        PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      }
      return NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(smallIcon(context))
        .setContentTitle("SMS gateway is on")
        .setContentText(text)
        .setContentIntent(open)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .setCategory(NotificationCompat.CATEGORY_SERVICE)
        .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
        .build()
    }

    private fun ensureChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (manager.getNotificationChannel(CHANNEL_ID) != null) return
      // LOW: visible and persistent, never a sound — the orders channel owns
      // the ringtone that means a customer is waiting.
      val channel = NotificationChannel(CHANNEL_ID, "SMS gateway", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Shown while this phone sends loyalty reward codes for the store."
        setShowBadge(false)
      }
      manager.createNotificationChannel(channel)
    }

    private fun smallIcon(context: Context): Int {
      val custom = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
      return if (custom != 0) custom else android.R.drawable.stat_notify_chat
    }
  }
}
