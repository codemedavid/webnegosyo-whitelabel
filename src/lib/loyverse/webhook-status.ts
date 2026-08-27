/**
 * Pure presentation of a tenant's Loyverse webhook registration state.
 *
 * The registration itself never throws (see webhooks.ts), so this line in the
 * superadmin form is the only place a broken continuous sync becomes visible.
 * An error always wins over a past success: webhooks Loyverse has disabled
 * are exactly the case where a stale "registered" stamp would lie.
 */

export interface LoyverseWebhookStatusFields {
  loyverse_webhooks_registered_at?: string | null
  loyverse_webhook_error?: string | null
}

export interface LoyverseWebhookStatus {
  tone: 'ok' | 'error' | 'pending'
  message: string
}

export function describeLoyverseWebhookStatus(
  fields: LoyverseWebhookStatusFields
): LoyverseWebhookStatus {
  if (fields.loyverse_webhook_error) {
    return {
      tone: 'error',
      message: `Live updates are OFF — last registration failed: ${fields.loyverse_webhook_error}`,
    }
  }
  if (fields.loyverse_webhooks_registered_at) {
    const date = new Date(fields.loyverse_webhooks_registered_at)
    const stamp = Number.isNaN(date.getTime())
      ? fields.loyverse_webhooks_registered_at
      : date.toLocaleString()
    return {
      tone: 'ok',
      message: `Live updates active — webhooks confirmed ${stamp}. Menu and stock changes in Loyverse appear here automatically.`,
    }
  }
  return {
    tone: 'pending',
    message: 'Webhooks not registered yet — run "Sync now" once to connect live updates.',
  }
}
