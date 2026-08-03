package expo.modules.smssender

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telephony.SmsManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.atomic.AtomicInteger

/**
 * Direct device SMS for the merchant follow-up campaigns.
 *
 * Deliberately different from the `sms/` reference app in three ways, each of
 * which was a real defect there:
 *
 *  1. `SmsManager.getDefault()` is deprecated from API 31 and returns the
 *     wrong subscription on dual-SIM handsets — which most PH merchant phones
 *     are. We resolve the manager from the system service and honour an
 *     explicit `subscriptionId` when one is given.
 *  2. The reference passes `null` for the sent-intent, so its promise resolves
 *     the instant the message is handed to the radio. A campaign would log
 *     "sent" for every recipient while the phone was in airplane mode. We
 *     register a one-shot receiver per send and resolve only on the real
 *     per-part result.
 *  3. A multipart message reports once per part. We resolve when the last part
 *     lands, and reject on the FIRST failing part — a half-delivered message is
 *     a failure, not a success.
 *
 * A send that never reports (radio wedged, receiver dropped) would otherwise
 * hang the campaign run forever, so every send is bounded by a timeout.
 */
class SmsSenderModule : Module() {
  private val requestCounter = AtomicInteger(0)

  override fun definition() = ModuleDefinition {
    Name("SmsSender")

    AsyncFunction("sendSms") { phoneNumber: String, message: String, subscriptionId: Int?, promise: Promise ->
      sendSms(phoneNumber, message, subscriptionId, promise)
    }
  }

  private fun sendSms(phoneNumber: String, message: String, subscriptionId: Int?, promise: Promise) {
    val context = appContext.reactContext
      ?: return promise.reject(SmsSendException("NO_CONTEXT", "The app context is unavailable."))

    val smsManager = resolveSmsManager(context, subscriptionId)
      ?: return promise.reject(SmsSendException("NO_SMS_MANAGER", "This device cannot send SMS."))

    val parts = smsManager.divideMessage(message)
    if (parts.isEmpty()) {
      return promise.reject(SmsSendException("EMPTY_MESSAGE", "Refusing to send an empty message."))
    }

    val action = "${context.packageName}.SMS_SENT.${requestCounter.incrementAndGet()}"
    val pendingResults = AtomicInteger(parts.size)
    // Guards against the receiver firing after we have already settled: a
    // multipart send reports once per part, and a failure settles early.
    val settled = AtomicInteger(0)
    val timeoutHandler = Handler(Looper.getMainLooper())

    lateinit var receiver: BroadcastReceiver
    lateinit var timeoutRunnable: Runnable

    fun finish(block: () -> Unit) {
      if (settled.getAndIncrement() != 0) return
      timeoutHandler.removeCallbacks(timeoutRunnable)
      runCatching { context.unregisterReceiver(receiver) }
      block()
    }

    receiver = object : BroadcastReceiver() {
      override fun onReceive(receiverContext: Context, intent: Intent) {
        if (resultCode == android.app.Activity.RESULT_OK) {
          if (pendingResults.decrementAndGet() == 0) {
            finish { promise.resolve(null) }
          }
          return
        }
        finish {
          promise.reject(SmsSendException(errorCodeFor(resultCode), errorMessageFor(resultCode)))
        }
      }
    }

    timeoutRunnable = Runnable {
      finish {
        promise.reject(
          SmsSendException("TIMEOUT", "The phone did not report a result for this message in time.")
        )
      }
    }

    registerSentReceiver(context, receiver, action)
    timeoutHandler.postDelayed(timeoutRunnable, SEND_TIMEOUT_MS)

    val sentIntents = ArrayList<PendingIntent>(parts.size)
    for (index in parts.indices) {
      sentIntents.add(
        PendingIntent.getBroadcast(
          context,
          index,
          Intent(action).setPackage(context.packageName),
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
      )
    }

    try {
      smsManager.sendMultipartTextMessage(phoneNumber, null, parts, sentIntents, null)
    } catch (error: Throwable) {
      finish {
        promise.reject(
          SmsSendException("SEND_FAILED", error.message ?: "The phone refused to send this message.")
        )
      }
    }
  }

  private fun resolveSmsManager(context: Context, subscriptionId: Int?): SmsManager? {
    val manager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      context.getSystemService(SmsManager::class.java)
    } else {
      @Suppress("DEPRECATION")
      SmsManager.getDefault()
    } ?: return null

    // A merchant with two SIMs must be able to pin campaigns to the business
    // line; without this the system silently uses whichever SIM is default.
    if (subscriptionId == null || subscriptionId < 0) return manager
    return runCatching { manager.createForSubscriptionId(subscriptionId) }.getOrDefault(manager)
  }

  private fun registerSentReceiver(context: Context, receiver: BroadcastReceiver, action: String) {
    val filter = IntentFilter(action)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      // Required from API 33: an unexported receiver, since only our own
      // PendingIntent ever broadcasts this action.
      context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      context.registerReceiver(receiver, filter)
    }
  }

  /**
   * Stable codes the JS layer branches on. `NO_SERVICE` and `RADIO_OFF` are
   * retryable (the merchant walked out of signal); the rest are not.
   */
  private fun errorCodeFor(resultCode: Int): String = when (resultCode) {
    SmsManager.RESULT_ERROR_NO_SERVICE -> "NO_SERVICE"
    SmsManager.RESULT_ERROR_RADIO_OFF -> "RADIO_OFF"
    SmsManager.RESULT_ERROR_NULL_PDU -> "NULL_PDU"
    SmsManager.RESULT_ERROR_LIMIT_EXCEEDED -> "LIMIT_EXCEEDED"
    else -> "GENERIC_FAILURE"
  }

  private fun errorMessageFor(resultCode: Int): String = when (resultCode) {
    SmsManager.RESULT_ERROR_NO_SERVICE -> "No mobile service. Move somewhere with signal and retry."
    SmsManager.RESULT_ERROR_RADIO_OFF -> "The phone radio is off. Turn off airplane mode and retry."
    SmsManager.RESULT_ERROR_NULL_PDU -> "The phone could not build this message."
    SmsManager.RESULT_ERROR_LIMIT_EXCEEDED ->
      "Android is rate-limiting outgoing SMS. Wait a few minutes before sending more."
    else -> "The phone could not send this message."
  }

  private companion object {
    /** Long enough for a slow network to report, short enough not to stall a run. */
    const val SEND_TIMEOUT_MS = 60_000L
  }
}

private class SmsSendException(code: String, message: String) : CodedException(code, message, null)
