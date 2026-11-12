'use client'

/**
 * Settings → Text messages: the store's Semaphore account, the paid backup
 * that texts customer codes when no gateway phone is online. Codes it covers:
 * customer app sign-in, reward codes and rewards-page codes.
 *
 * Same endpoint and rules as the merchant app's card (`SmsFallbackCard`,
 * `POST /api/loyalty/sms-settings`): reading needs loyalty access, changing the
 * key is the owner's alone (it spends the owner's credits). The key is checked
 * with Semaphore before it is stored and is never sent back, so this card only
 * ever shows "on" or "off".
 */

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'

interface SmsStatus {
  gatewayOnline: boolean
  fallbackConfigured: boolean
  senderName: string | null
}

const UNAVAILABLE = 'Text message settings are unavailable. Try again.'

async function callSmsSettings(tenantId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data } = await createClient().auth.getSession()
  if (!data.session) throw new Error('Sign in again to change text message settings.')
  const response = await fetch('/api/loyalty/sms-settings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId, ...body }),
    cache: 'no-store',
  })
  const result = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : UNAVAILABLE)
  return result
}

export function parseSmsStatus(result: Record<string, unknown>): SmsStatus {
  const fallback = (result.fallback ?? {}) as Record<string, unknown>
  return {
    gatewayOnline: result.gatewayOnline === true,
    fallbackConfigured: fallback.configured === true,
    senderName: typeof fallback.senderName === 'string' && fallback.senderName !== '' ? fallback.senderName : null,
  }
}

const SENDER_NAME = /^[A-Za-z0-9]{1,11}$/

export function SmsSettingsCard({ tenantId, canChangeKey }: { tenantId: string; canChangeKey: boolean }) {
  const [status, setStatus] = useState<SmsStatus | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [senderName, setSenderName] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setStatus(parseSmsStatus(await callSmsSettings(tenantId, { action: 'status' })))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : UNAVAILABLE)
    }
  }, [tenantId])

  useEffect(() => {
    void load()
  }, [load])

  const run = async (body: Record<string, unknown>, done: string) => {
    setIsBusy(true)
    setError(null)
    setNotice(null)
    try {
      await callSmsSettings(tenantId, body)
      setApiKey('')
      setSenderName('')
      setNotice(done)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : UNAVAILABLE)
    } finally {
      setIsBusy(false)
    }
  }

  const trimmedSender = senderName.trim()
  const senderProblem = trimmedSender !== '' && !SENDER_NAME.test(trimmedSender)
    ? 'Sender name: up to 11 letters or digits, no spaces.'
    : null
  const save = () =>
    run({ action: 'save_fallback', apiKey: apiKey.trim(), senderName: trimmedSender === '' ? null : trimmedSender }, 'Semaphore is on.')
  const remove = () => run({ action: 'clear_fallback' }, 'Semaphore is off.')

  return (
    <section aria-labelledby="sms-settings-title" className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
      <div className="space-y-1">
        <h2 id="sms-settings-title" className="text-base font-semibold text-gray-900">
          Semaphore account
        </h2>
        <p className="text-sm text-gray-600">
          Your store texts codes to customers: sign-in codes for your customer app, reward codes, and rewards-page
          codes. A gateway phone (set up in the merchant app) sends them for free. When no phone is online, they go
          through your own Semaphore account instead, about 2 credits per text.
        </p>
      </div>

      {status ? (
        <ul className="space-y-1 text-sm">
          <li className={status.gatewayOnline ? 'font-medium text-green-700' : 'text-gray-700'}>
            {status.gatewayOnline ? '● A gateway phone is online' : '○ No gateway phone is online'}
          </li>
          <li className={status.fallbackConfigured ? 'font-medium text-green-700' : 'text-gray-700'}>
            {status.fallbackConfigured
              ? `● Semaphore is on${status.senderName ? ` (sender: ${status.senderName})` : ''}`
              : '○ Semaphore is off'}
          </li>
        </ul>
      ) : error ? null : (
        <p className="text-sm text-gray-500">Checking…</p>
      )}

      {status && !status.gatewayOnline && !status.fallbackConfigured ? (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Right now no code can be sent: customers can&apos;t sign in to your app with a new phone, and reward codes ask
          them to see the cashier. Add your Semaphore API key, or turn on a gateway phone in the merchant app.
        </p>
      ) : null}

      {status && canChangeKey ? (
        status.fallbackConfigured ? (
          <Button type="button" variant="outline" disabled={isBusy} onClick={() => void remove()}>
            {isBusy ? 'Working…' : 'Remove Semaphore'}
          </Button>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              if (apiKey.trim() !== '' && !senderProblem) void save()
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="semaphore-api-key">Semaphore API key</Label>
              <Input
                id="semaphore-api-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="Paste it from your Semaphore dashboard"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="semaphore-sender">Sender name (optional)</Label>
              <Input
                id="semaphore-sender"
                autoComplete="off"
                spellCheck={false}
                maxLength={11}
                value={senderName}
                onChange={(event) => setSenderName(event.target.value)}
                placeholder="Approved in Semaphore, e.g. MYCAFE"
                aria-invalid={senderProblem ? true : undefined}
              />
              {senderProblem ? <p className="text-sm text-red-700">{senderProblem}</p> : null}
            </div>
            <Button type="submit" disabled={isBusy || apiKey.trim() === '' || senderProblem !== null}>
              {isBusy ? 'Checking with Semaphore…' : 'Save'}
            </Button>
            <p className="text-xs text-gray-500">
              We check the key with Semaphore before saving it. It is stored privately and never shown again.
            </p>
          </form>
        )
      ) : status ? (
        <p className="text-sm text-gray-600">Only the store owner can add or remove the Semaphore key.</p>
      ) : null}

      {notice ? (
        <p role="status" className="text-sm text-green-700">
          {notice}
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
