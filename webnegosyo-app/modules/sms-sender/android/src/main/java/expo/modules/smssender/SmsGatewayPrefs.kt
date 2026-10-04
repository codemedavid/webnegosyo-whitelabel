package expo.modules.smssender

import android.content.Context

/**
 * The merchant's gateway switch, kept natively so a reboot or an app update
 * can restart the service before any JS has run. Holds only the tenant and
 * actor ids — the device credential stays in the keystore (expo-secure-store),
 * read by the JS task.
 */
internal object SmsGatewayPrefs {
  private const val FILE = "webnegosyo.loyalty_sms_gateway"
  private const val KEY_ENABLED = "enabled"
  private const val KEY_TENANT = "tenantId"
  private const val KEY_ACTOR = "actorId"
  private const val KEY_STATUS = "status"
  private const val DEFAULT_STATUS = "Ready to send reward codes"
  private val UUID = Regex("^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$", RegexOption.IGNORE_CASE)

  data class Config(val tenantId: String, val actorId: String)

  private fun prefs(context: Context) =
    context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)

  fun isValidId(value: String?): Boolean = value != null && UUID.matches(value)

  fun enable(context: Context, tenantId: String, actorId: String) {
    prefs(context).edit()
      .putBoolean(KEY_ENABLED, true)
      .putString(KEY_TENANT, tenantId)
      .putString(KEY_ACTOR, actorId)
      .putString(KEY_STATUS, DEFAULT_STATUS)
      .commit()
  }

  fun disable(context: Context) {
    prefs(context).edit().clear().commit()
  }

  /** The switch is on AND well-formed; anything else reads as off. */
  fun read(context: Context): Config? {
    val stored = prefs(context)
    if (!stored.getBoolean(KEY_ENABLED, false)) return null
    val tenantId = stored.getString(KEY_TENANT, null)
    val actorId = stored.getString(KEY_ACTOR, null)
    if (!isValidId(tenantId) || !isValidId(actorId)) return null
    return Config(tenantId!!, actorId!!)
  }

  fun statusText(context: Context): String = prefs(context).getString(KEY_STATUS, null) ?: DEFAULT_STATUS

  fun setStatusText(context: Context, text: String) {
    prefs(context).edit().putString(KEY_STATUS, text.take(120)).apply()
  }
}
