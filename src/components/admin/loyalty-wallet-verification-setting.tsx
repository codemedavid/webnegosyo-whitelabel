'use client'

/**
 * "Verify before showing rewards": with this on, the public rewards page (and
 * the stamp count at checkout) shows nothing for a typed number until the
 * customer enters the SMS code sent to it.
 *
 * Same endpoint as the merchant app's card (`/api/loyalty/sms-settings`). The
 * codes travel the reward-code route — a gateway phone, else the store's
 * Semaphore backup — so the card warns when neither can send right now.
 */

import { useCallback, useEffect, useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { createClient } from '@/lib/supabase/client'

interface SmsSettings {
  gatewayOnline: boolean
  fallbackConfigured: boolean
  walletVerification: boolean
}

async function callSettings(tenantId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data } = await createClient().auth.getSession()
  if (!data.session) throw new Error('Sign in to change loyalty settings.')
  const response = await fetch('/api/loyalty/sms-settings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId, ...body }),
    cache: 'no-store',
  })
  const result = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Loyalty settings are unavailable.')
  return result
}

function parseSettings(result: Record<string, unknown>): SmsSettings {
  const fallback = result.fallback as Record<string, unknown> | undefined
  return {
    gatewayOnline: result.gatewayOnline === true,
    fallbackConfigured: fallback?.configured === true,
    walletVerification: result.walletVerification === true,
  }
}

export function LoyaltyWalletVerificationSetting({ tenantId }: { tenantId: string }) {
  const [settings, setSettings] = useState<SmsSettings | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setSettings(parseSettings(await callSettings(tenantId, { action: 'status' })))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Loyalty settings are unavailable.')
    }
  }, [tenantId])

  useEffect(() => {
    void load()
  }, [load])

  const toggle = async (enabled: boolean) => {
    if (!settings) return
    setIsSaving(true)
    setError(null)
    try {
      const result = await callSettings(tenantId, { action: 'set_wallet_verification', enabled })
      setSettings({ ...settings, walletVerification: result.walletVerification === true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const cannotSend = settings !== null && !settings.gatewayOnline && !settings.fallbackConfigured
  return (
    <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 id="wallet-verification-title" className="text-base font-semibold text-gray-900">
            Verify before showing rewards
          </h2>
          <p className="text-sm text-gray-600">
            Customers get an SMS code and enter it before they can see their stamp card and rewards on your
            rewards page. The stamp count at checkout is hidden too.
          </p>
        </div>
        <Switch
          aria-labelledby="wallet-verification-title"
          checked={settings?.walletVerification === true}
          disabled={!settings || isSaving}
          onCheckedChange={(checked) => void toggle(checked)}
        />
      </div>
      {settings?.walletVerification && cannotSend ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          No gateway phone is online and there is no Semaphore backup, so customers can&apos;t get a code right now and
          won&apos;t see their rewards. Turn on a gateway phone in the merchant app or add a Semaphore backup.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </section>
  )
}
