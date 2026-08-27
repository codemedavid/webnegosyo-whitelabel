import { describeLoyverseWebhookStatus } from '@/lib/loyverse/webhook-status'

describe('describeLoyverseWebhookStatus', () => {
  it('reports live sync active when registration is confirmed and error-free', () => {
    const status = describeLoyverseWebhookStatus({
      loyverse_webhooks_registered_at: '2026-08-27T10:00:00Z',
      loyverse_webhook_error: null,
    })
    expect(status.tone).toBe('ok')
    expect(status.message).toContain('Live updates active')
  })

  it('reports the failure reason when the last registration attempt errored', () => {
    const status = describeLoyverseWebhookStatus({
      loyverse_webhooks_registered_at: null,
      loyverse_webhook_error: 'LOYVERSE_WEBHOOK_SECRET is not set',
    })
    expect(status.tone).toBe('error')
    expect(status.message).toContain('LOYVERSE_WEBHOOK_SECRET is not set')
  })

  it('an error AFTER a past success still surfaces as an error — stale success must not mask it', () => {
    const status = describeLoyverseWebhookStatus({
      loyverse_webhooks_registered_at: '2026-08-01T00:00:00Z',
      loyverse_webhook_error: 'No public https app URL configured',
    })
    expect(status.tone).toBe('error')
  })

  it('reports never-registered when neither field is set', () => {
    const status = describeLoyverseWebhookStatus({})
    expect(status.tone).toBe('pending')
    expect(status.message).toContain('not registered yet')
  })
})
