package expo.modules.smssender

import android.telephony.SmsManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SmsSenderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SmsSender")

    AsyncFunction("sendSms") { phoneNumber: String, message: String ->
      val smsManager = SmsManager.getDefault()
      val messageParts = smsManager.divideMessage(message)
      smsManager.sendMultipartTextMessage(phoneNumber, null, messageParts, null, null)
    }
  }
}
